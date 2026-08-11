/**
 * WebConsole 应用服务（DDD application 层，无单测——薄编排，行为经 /web 冒烟验证）。
 * 职责：WebConsole 生命周期（启动/停止）、事件广播、状态快照、特权续链、ctx.ui 桥接。
 * 不直接做 RPC 派发（interface/rpc-handler）与传输细节（infrastructure/server）。
 */

import { connect as netConnect } from "node:net";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";
import WebSocket from "ws";
import { fileURLToPath } from "node:url";
import {
  SessionManager,
  type BuildSystemPromptOptions,
  type ExtensionAPI,
  type ExtensionCommandContext,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { createCoalescer, type Coalescer } from "../infrastructure/coalescer.js";
import { probePrivileged } from "../domain/privilege-probe.js";
import { portAlive } from "../infrastructure/net-probe.js";
import { resolveConnectAction, resolveTuiSessionSwitch } from "../domain/orchestrate.js";
import type { WebStateFile } from "../domain/registry.js";
import { newSessionSpawnSpec, sessionInstanceSpawnSpec, webServiceSpawnSpec } from "../domain/spawn-spec.js";
import { startWebServer, WebServerError, type WebServerHandle } from "../infrastructure/server.js";
import { makeEvent, serialize } from "../domain/protocol.js";
import { buildState } from "../domain/state.js";
import {
  HOST_PROCESS_ID,
  RegistryStore,
  parseStateFile,
  serializeStateFile,
  stateFilePath,
  type AgentEntry,
} from "../domain/registry.js";
import { expandSkillChips, skillLookupFrom } from "../domain/skill-expand.js";
import { askRegistry } from "../domain/web-ask.js";
import { mapEvent } from "../interface/events.js";
import { isStaleError } from "../domain/fork-util.js";

const FLUSH_INTERVAL_MS = 60;
const MAX_CLIENTS = 16;
const UI_BRIDGE_WRAP = Symbol("pi-web.ui-bridge-wrapped");

/**
 * 前端静态目录探测（运行时）：
 * - 构建产物（dist/server/index.js）：base/../client
 * - 源码（jiti 加载 src/server/application/web-console.ts）：base/../../../../dist/client
 */
const WEB_DIR = (() => {
  const base = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(base, "..", "client"),
    join(base, "..", "..", "..", "dist", "client"),
  ];
  return candidates.find((c) => existsSync(join(c, "index.html"))) ?? candidates[0];
})();

export const THINKING_LEVELS = new Set(["off", "minimal", "low", "medium", "high", "xhigh", "max"]);
export const ALL_THINKING_LEVELS = [...THINKING_LEVELS];

export interface WebConsoleState {
  server: WebServerHandle | null;
  token: string;
  /** 当前会话 api（factory 每次重跑时重绑；会话替换后自动新鲜） */
  api: ExtensionAPI | null;
  /** 当前会话 ctx（session_start 捕获；切换间隙为 null） */
  ctx: ExtensionContext | null;
  /** 特权 ctx（/web handler 捕获；withSession 续链；TUI 手动切换后 stale） */
  privileged: ExtensionCommandContext | null;
  coalescer: Coalescer<Record<string, unknown>> | null;
  flushTimer: ReturnType<typeof setInterval> | null;
  /** 多实例注册表（本进程为宿主时使用） */
  registry: RegistryStore;
  /** 本进程为注册者（agent 模式）时：宿主连接与分配的 processId */
  agent: { ws: WebSocket; processId: string; hostUrl: string } | null;
  /** agent 模式 usage 周期上报定时器 */
  usageTimer: ReturnType<typeof setInterval> | null;
  /** 本进程 cwd（注册/状态文件用） */
  cwd: string | null;
}




export function createWebConsole(): WebConsole {
  return new WebConsole({
    server: null,
    token: "",
    api: null,
    ctx: null,
    privileged: null,
    coalescer: null,
    flushTimer: null,
    registry: new RegistryStore(),
    agent: null,
    usageTimer: null,
    cwd: null,
  });
}

export class WebConsole {
  constructor(public readonly state: WebConsoleState) {}

  /** 会话生命周期绑定（session_start 捕获；factory 每次重跑时重绑 api） */
  bindApi(api: ExtensionAPI): void {
    this.state.api = api;
  }

  bindCtx(ctx: ExtensionContext): void {
    this.state.ctx = ctx;
    this.wrapUiBridge(ctx);
  }

  /** 特权 ctx（/web handler 捕获；withSession 续链；TUI 手动切换后 stale） */
  setPrivileged(ctx: ExtensionCommandContext | null): void {
    this.state.privileged = ctx;
  }

  /** 探测特权有效性（R26 session-follow）；失效时清 stale 捕获（后续错误文案统一"未就绪"） */
  probePrivilegedStatus(): boolean {
    const ok = probePrivileged(this.state.privileged);
    if (!ok) this.state.privileged = null;
    return ok;
  }

  /** 探测 + 广播特权状态（session_start 探测可能先于续链误报降级——续链完成后用此纠正） */
  broadcastPrivilegeStatus(): void {
    this.broadcast("privilege_status", { ok: this.probePrivilegedStatus() });
  }

  /** 当前会话 ctx；未就绪（切换中）→ 明确错误 */
  requireCtx(): ExtensionContext {
    if (!this.state.ctx) throw new WebServerError(3, "会话未就绪（切换中？），请重试");
    return this.state.ctx;
  }

  requirePrivileged(): ExtensionCommandContext {
    if (!this.state.privileged) {
      throw new WebServerError(1, "会话控制能力未就绪：请在 TUI 重跑 /web");
    }
    return this.state.privileged;
  }

  /** 调用特权操作；stale（TUI 手动切换后）→ 明确降级错误 */
  async privilegedCall<T>(fn: (priv: ExtensionCommandContext) => Promise<T>): Promise<T> {
    const priv = this.requirePrivileged();
    try {
      return await fn(priv);
    } catch (err) {
      if (isStaleError(err)) {
        throw new WebServerError(1, "会话控制能力已失效：请在 TUI 重跑 /web 恢复");
      }
      throw err;
    }
  }

  /** withSession 续链：会话替换后特权 ctx 自动指向新会话（SPEC §3.1） */
  withPrivilegedRefresh<T extends object>(
    options: T,
  ): T & { withSession: (c: ExtensionCommandContext) => Promise<void> } {
    return {
      ...options,
      withSession: async (fresh: ExtensionCommandContext) => {
        this.state.privileged = fresh;
        this.state.ctx = fresh;
        this.wrapUiBridge(fresh);
        // R26：续链完成后特权必然有效——广播纠正 session_start 探测（其在续链前误报降级）
        this.broadcastPrivilegeStatus();
        await (options as { withSession?: (c: ExtensionCommandContext) => Promise<void> }).withSession?.(fresh);
      },
    };
  }

  isRunning(): boolean {
    return this.state.server !== null;
  }

  get url(): string | null {
    return this.state.server?.url ?? null;
  }

  get port(): number | null {
    return this.state.server?.port ?? null;
  }

  /**
   * 启动服务（幂等：已在运行时返回 false 由命令层提示）。
   * selfRegister：本进程是否自注册为会话 tab——服务进程（--web）为 false（无会话）；
   * 旧 /web 宿主语义为 true（02 起 /web 改为注册者后不再走此路径）。
   */
  async start(port: number, open: boolean, cwd: string, selfRegister = true): Promise<{ url: string }> {
    const token = randomBytes(24).toString("hex");
    if (!existsSync(join(WEB_DIR, "index.html"))) {
      throw new WebServerError(1, "前端未构建：请先运行 npm run build:web（构建到 dist/client）");
    }
    const server = await startWebServer({
      port,
      token,
      webDir: WEB_DIR,
      handleRequest: this.handleRequest,
      maxClients: MAX_CLIENTS,
      onClientChange: (count) => {
        this.state.ctx?.ui.setStatus("pi-web", count > 0 ? `web 客户端: ${count}` : undefined);
      },
      agentEvents: {
        onAgentHello: (info) => {
          const kind = info.kind === "spawned" ? "spawned" : "external";
          // 已注册（session_start 后重发 hello）→ 更新会话信息
          const existing = this.state.registry.list().find((a) => a.pid === info.pid);
          if (existing) {
            const newFile = info.sessionFile ?? existing.sessionFile;
            const updated = { ...existing, sessionFile: newFile, sessionName: info.sessionName ?? existing.sessionName };
            this.state.registry.add(updated);
            // TUI 切会话（hello 重发带新 sessionFile）：杀撞车 spawn 实例（jsonl 双写排他）+ 广播接管
            if (newFile && existing.sessionFile !== newFile) {
              const { kill } = resolveTuiSessionSwitch(this.state.registry.list(), existing.processId, newFile);
              for (const pid of kill) this.killAgent(pid);
              if (kill.length > 0) this.broadcast("tui_takeover", { sessionFile: newFile });
            }
            // 广播列表（客户端 diff 跟随：旧 tab 关 + 新 tab 开）
            this.broadcastAgentList();
            return existing.processId;
          }
          const processId = this.state.registry.nextProcessId(kind);
          this.state.registry.add({
            processId,
            pid: info.pid,
            kind,
            sessionFile: info.sessionFile,
            sessionName: info.sessionName,
            cwd: info.cwd,
            connectedAt: Date.now(),
          });
          this.broadcastAgentList();
          return processId;
        },
        onAgentEvent: (processId, event) => {
          // TUI 切会话编排在 onAgentHello（hello 重发带新 sessionFile）
          this.broadcastAgentEvent(processId, event);
        },
        onAgentClose: (processId) => {
          this.state.registry.remove(processId);
          // 顺序：先 agent_closed（客户端标记断线）再 agent_list（leave 对 dead tab 保持）
          this.broadcast("agent_closed", { processId });
          this.broadcastAgentList();
        },
      },
    });
    this.state.server = server;
    this.state.token = token;
    this.state.cwd = cwd;
    this.state.coalescer = createCoalescer(FLUSH_INTERVAL_MS);
    this.state.flushTimer = setInterval(() => this.drain(), FLUSH_INTERVAL_MS);
    // 自注册（旧 /web 宿主语义）；服务进程（--web）不注册——无会话 tab
    if (selfRegister) {
      this.state.registry.add({
        processId: HOST_PROCESS_ID,
        pid: process.pid,
        kind: "host",
        sessionFile: this.state.ctx?.sessionManager.getSessionFile() ?? null,
        sessionName: this.state.ctx?.sessionManager.getSessionName() ?? null,
        cwd,
        connectedAt: Date.now(),
      });
    }
    this.writeStateFile(cwd, { port: server.port, token, serverPid: process.pid, startedAt: Date.now() });
    this.pushState();
    this.broadcastAgentList();
    if (open) await this.openBrowser(server.url);
    return { url: server.url };
  }

  /** 终止 spawn 实例（TUI 接管排他）——SIGTERM 优雅；WS close 触发 onAgentClose 清理 */
  killAgent(processId: string): void {
    const entry = this.state.registry.get(processId);
    if (!entry || entry.kind !== "spawned") return;
    try {
      process.kill(entry.pid, "SIGTERM");
    } catch {
      /* 已退出 */
    }
  }

  /** 新建会话：spawn 新实例（--session-id 创建）并等注册（同打开历史会话的 spawn 路径） */
  async spawnNewSession(hostUrl: string): Promise<string> {
    if (!this.extensionPath) throw new WebServerError(1, "扩展路径未知，无法 spawn 会话实例");
    const sessionId = `web-${Date.now().toString(36)}`;
    const spec = newSessionSpawnSpec({
      execPath: process.execPath,
      piEntry: process.argv[1] ?? "",
      extensionPath: this.extensionPath,
      sessionId,
      hostUrl,
    });
    const cwd = this.state.cwd ?? process.cwd();
    const env = { ...process.env, ...spec.env };
    delete env.PI_WEB_SERVICE;
    const child = spawn(spec.execPath, spec.argv, {
      cwd,
      env,
      detached: true,
      stdio: ["pipe", "ignore", "ignore"],
    });
    child.unref();
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 300));
      // 新实例 hello 带创建的 sessionFile（无 sessionFile 的注册者不算——等就绪）
      const entry = this.state.registry.list().find((a) => a.pid === child.pid && a.sessionFile);
      if (entry) return entry.processId;
    }
    throw new WebServerError(1, "新建会话实例启动超时（20s）");
  }

  /**
   * /web 注册编排（无宿主语义）：无服务 → 自动 spawn 服务进程 → 注册；残留清理。
   */
  async ensureWebService(cwd: string): Promise<{ url: string }> {
    if (this.state.agent) return { url: this.state.agent.hostUrl };
    if (this.state.server) throw new WebServerError(1, "本进程是服务进程，无需注册");
    const shared = WebConsole.readStateFile(cwd);
    const alive = shared ? await portAlive(shared.port, netConnect) : false;
    const action = resolveConnectAction(shared, alive);
    if (action !== "connect") {
      if (action === "cleanup-spawn") WebConsole.clearStateFile(cwd);
      await this.spawnWebService(cwd);
    }
    return this.connectToHost(cwd);
  }

  /** spawn 独立服务进程（detached + stdin pipe 保活——rpc 进程 stdin EOF 退出教训）并等状态文件就绪 */
  async spawnWebService(cwd: string): Promise<void> {
    if (!this.extensionPath) throw new WebServerError(1, "扩展路径未知，无法 spawn 服务进程");
    const spec = webServiceSpawnSpec({
      execPath: process.execPath,
      piEntry: process.argv[1] ?? "",
      extensionPath: this.extensionPath,
    });
    const child = spawn(spec.execPath, spec.argv, {
      cwd,
      env: { ...process.env, ...spec.env },
      detached: true,
      stdio: ["pipe", "ignore", "ignore"],
    });
    child.unref();
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 300));
      const sf = WebConsole.readStateFile(cwd);
      if (sf && (await portAlive(sf.port, netConnect))) return;
    }
    throw new WebServerError(1, "web 服务进程启动超时（20s）");
  }

  /** 会话实例幂等：注册表已有该会话 → 返回 processId；否则 spawn 新实例并等注册 */
  async spawnSessionInstance(sessionFile: string, hostUrl: string): Promise<string> {
    const existing = this.state.registry.list().find((a) => a.sessionFile === sessionFile);
    if (existing) return existing.processId;
    if (!this.extensionPath) throw new WebServerError(1, "扩展路径未知，无法 spawn 会话实例");
    const spec = sessionInstanceSpawnSpec({
      execPath: process.execPath,
      piEntry: process.argv[1] ?? "",
      extensionPath: this.extensionPath,
      sessionFile,
      hostUrl,
    });
    const cwd = this.state.cwd ?? process.cwd();
    // 清除 PI_WEB_SERVICE（继承自服务进程环境——否则子进程误入服务模式不注册）
    const env = { ...process.env, ...spec.env };
    delete env.PI_WEB_SERVICE;
    const child = spawn(spec.execPath, spec.argv, {
      cwd,
      env,
      detached: true,
      stdio: ["pipe", "ignore", "ignore"],
    });
    child.unref();
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 300));
      const entry = this.state.registry.list().find((a) => a.sessionFile === sessionFile);
      if (entry) return entry.processId;
    }
    throw new WebServerError(1, "会话实例启动超时（20s）");
  }

  /**
   * /web 语义编排（index.ts 只接线——决策树收进应用层）：
   * 同 cwd 已有存活宿主 → 注册；残留状态文件（宿主死）→ 清理后作为宿主启动。
   */
  async startOrConnect(cwd: string, port: number, open: boolean): Promise<{ url: string; mode: "host" | "agent" }> {
    const shared = WebConsole.readStateFile(cwd);
    if (shared) {
      if (!(await portAlive(shared.port, netConnect))) {
        WebConsole.clearStateFile(cwd);
      } else {
        const { url } = this.connectToHost(cwd);
        return { url, mode: "agent" };
      }
    }
    const { url } = await this.start(port, open, cwd);
    return { url, mode: "host" };
  }

  /** spawn 实例自动注册（宿主注入的 env）；返回是否注册 */
  autoRegisterIfNeeded(cwd: string): boolean {
    if (!process.env.PI_WEB_HOST_URL || this.isRunning() || this.isAgent()) return false;
    try {
      const { url } = this.connectToHost(cwd);
      console.log(`[pi-web] 已自动注册共享 web 控制台：${url}`);
      return true;
    } catch (err) {
      console.log(`[pi-web] 自动注册失败：${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  /** 写宿主状态文件（.pi/web.json——后续 /web 进程据此注册） */
  private writeStateFile(cwd: string, state: { port: number; token: string; serverPid: number; startedAt: number }): void {
    try {
      const dir = join(cwd, ".pi");
      mkdirSync(dir, { recursive: true });
      writeFileSync(stateFilePath(cwd), serializeStateFile(state), "utf8");
    } catch {
      /* 状态文件写失败不阻塞服务 */
    }
  }

  /** 读宿主状态文件；不存在/非法返回 null */
  static readStateFile(cwd: string): WebStateFile | null {
    try {
      return parseStateFile(readFileSync(stateFilePath(cwd), "utf8"));
    } catch {
      return null;
    }
  }

  /** 清宿主状态文件（--stop 时） */
  static clearStateFile(cwd: string): void {
    try {
      writeFileSync(stateFilePath(cwd), "", "utf8");
    } catch {
      /* 忽略 */
    }
  }

  /** 本进程是否运行在 agent 模式（注册进宿主） */
  isAgent(): boolean {
    return this.state.agent !== null;
  }

  /** agent 模式：上报 context usage（水杯进度条数据——事件上行） */
  reportUsage(): void {
    if (!this.state.agent) return;
    const ctx = this.state.ctx;
    const usage = ctx?.getContextUsage?.();
    if (!usage) return;
    this.broadcast("usage_update", {
      percent: usage.percent,
      tokens: usage.tokens ?? null,
      contextWindow: usage.contextWindow ?? null,
    });
  }

  /** agent 模式：重发 hello（session_start 后会话信息更新） */
  refreshAgentHello(): void {
    const agent = this.state.agent;
    if (!agent || agent.ws.readyState !== agent.ws.OPEN) return;
    agent.ws.send(
      JSON.stringify({
        type: "hello",
        pid: process.pid,
        cwd: this.state.cwd,
        sessionFile: this.state.ctx?.sessionManager.getSessionFile() ?? null,
        sessionName: this.state.ctx?.sessionManager.getSessionName() ?? null,
        kind: process.env.PI_WEB_HOST_KIND ?? "external",
      }),
    );
  }

  /** 扩展入口路径（spawn 新实例用；index.ts 启动时注册） */
  private extensionPath: string | null = null;
  setExtensionPath(p: string): void {
    this.extensionPath = p;
  }



  /** agent 模式的宿主 URL（重跑 /web 显示用） */
  agentHostUrl(): string | null {
    return this.state.agent?.hostUrl ?? null;
  }

  /**
   * agent 模式：读宿主状态文件并注册（不启动服务）。
   * 本进程事件经 WS 上行；宿主命令（send/abort）经 WS 下行执行。
   */
  connectToHost(cwd: string): { url: string } {
    if (this.state.server) throw new WebServerError(1, "本进程已是宿主，无需注册");
    const stateFile = WebConsole.readStateFile(cwd);
    if (!stateFile) throw new WebServerError(1, "未发现共享 web 服务状态文件（.pi/web.json）");
    const ws = new WebSocket(`ws://127.0.0.1:${stateFile.port}/agent?token=${encodeURIComponent(stateFile.token)}`);
    this.state.agent = { ws, processId: "", hostUrl: `http://127.0.0.1:${stateFile.port}/?token=${encodeURIComponent(stateFile.token)}` };
    this.state.cwd = cwd;
    const onOpen = () => {
      ws.send(
        JSON.stringify({
          type: "hello",
          pid: process.pid,
          cwd,
          sessionFile: this.state.ctx?.sessionManager.getSessionFile() ?? null,
          sessionName: this.state.ctx?.sessionManager.getSessionName() ?? null,
          kind: process.env.PI_WEB_HOST_KIND ?? "external",
        }),
      );
      // 周期上报 usage（水杯水位）——注册者视角
      this.state.usageTimer = setInterval(() => this.reportUsage(), 5000);
      this.reportUsage();
    };
    const onMessage = (data: Buffer) => {
      let msg: { type?: string; processId?: string; command?: string; text?: string; deliverAs?: string };
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (msg.type === "welcome" && this.state.agent) {
        this.state.agent.processId = msg.processId ?? "";
        return;
      }
      if (msg.type === "command" && this.state.agent) {
        void this.handleAgentCommand(msg.command ?? "", msg);
      }
    };
    const onClose = () => {
      this.state.agent = null;
      if (this.state.usageTimer) {
        clearInterval(this.state.usageTimer);
        this.state.usageTimer = null;
      }
    };
    ws.on("open", onOpen);
    ws.on("message", onMessage);
    ws.on("close", onClose);
    ws.on("error", () => {
      /* close 处理 */
    });
    return { url: this.state.agent.hostUrl };
  }

  /** agent 模式下的宿主命令执行 */
  private async handleAgentCommand(
    command: string,
    msg: { text?: string; deliverAs?: string; toolCallId?: string; answer?: unknown },
  ): Promise<void> {
    try {
      if (command === "send") {
        if (typeof msg.text !== "string" || msg.text.trim() === "") throw new WebServerError(-32602, "text 必须是非空字符串");
        await this.sendLocalMessage(msg.text.trim(), msg.deliverAs);
      } else if (command === "abort") {
        this.requireCtx().abort();
      } else if (command === "ask-answer") {
        // multi-instance：web 提问回答路由（本进程 registry）
        const toolCallId = typeof msg.toolCallId === "string" ? msg.toolCallId : "";
        if (toolCallId !== "" && askRegistry.answer(toolCallId, msg.answer)) {
          return;
        }
        throw new WebServerError(-32602, `未找到对应的提问（toolCallId=${toolCallId}）`);
      } else if (command === "deregister") {
        // 宿主注销本进程：断开连接（进程继续运行）
        this.state.agent?.ws.close();
      }
    } catch (err) {
      this.state.agent?.ws.send(JSON.stringify({ type: "command-result", ok: false, error: err instanceof Error ? err.message : String(err) }));
    }
  }

  /** 注册进程列表（浏览器初始化/变化时推送） */
  agentList(): AgentEntry[] {
    return this.state.registry.list();
  }

  /** 本进程（宿主或 agent）发送消息：chip 展开 + api.sendUserMessage */
  async sendLocalMessage(text: string, deliverAs?: string): Promise<void> {
    if (!this.state.api) throw new WebServerError(3, "扩展未就绪");
    const expanded = expandSkillChips(text, skillLookupFrom(this.state.api));
    await this.state.api.sendUserMessage(expanded, deliverAs === "steer" || deliverAs === "followUp" ? { deliverAs } : undefined);
  }

  /** 向指定进程下发命令（host 本地 / agent WS 下行） */
  sendToProcess(processId: string, command: string, payload: Record<string, unknown>): void {
    if (processId === HOST_PROCESS_ID) {
      if (this.state.agent) throw new WebServerError(1, "本进程是注册者，无法执行宿主命令");
      void this.handleAgentCommand(command, payload as { text?: string; deliverAs?: string });
      return;
    }
    const entry = this.state.registry.get(processId);
    if (!entry) throw new WebServerError(1, `进程未注册：${processId}`);
    if (entry.kind === "external" || entry.kind === "spawned") {
      this.state.server?.sendAgentCommand(processId, { command, ...payload });
      return;
    }
    throw new WebServerError(1, `不支持的进程类型：${entry.kind}`);
  }



  /** 广播注册进程列表变化 */
  broadcastAgentList(): void {
    if (this.state.agent) return;
    this.broadcast("agent_list", { agents: this.agentList() });
  }

  /** 广播注册者事件（包 processId——浏览器按进程分发；event 为扁平字段） */
  broadcastAgentEvent(processId: string, event: Record<string, unknown>): void {
    if (this.state.agent || !this.state.server || !this.state.coalescer) return;
    const type = typeof event.type === "string" ? event.type : "unknown";
    const mapped = mapEvent(type, event);
    if (!mapped.fields) return;
    const wrapped = makeEvent("agent-event", {
      processId,
      event: { type, ...mapped.fields },
    }) as unknown as Record<string, unknown>;
    this.state.coalescer.push(wrapped);
    if (mapped.refreshState) this.pushState();
  }

  async stop(): Promise<void> {
    if (this.state.flushTimer) {
      clearInterval(this.state.flushTimer);
      this.state.flushTimer = null;
    }
    this.state.coalescer = null;
    const wasHost = this.state.server !== null;
    const server = this.state.server;
    this.state.server = null;
    this.state.token = "";
    // 仅宿主清状态文件（agent 模式退出不影响共享服务）
    if (wasHost && !this.state.agent && this.state.cwd) {
      WebConsole.clearStateFile(this.state.cwd);
    }
    this.state.cwd = null;
    this.state.registry = new RegistryStore();
    if (server) await server.stop();
  }

  // -------------------------------------------------------------------------
  // 广播
  // -------------------------------------------------------------------------

  broadcast(type: string, payload: Record<string, unknown>): void {
    if (this.state.agent) {
      // agent 模式：本进程事件上行宿主
      const agent = this.state.agent;
      if (agent.ws.readyState === agent.ws.OPEN) {
        agent.ws.send(JSON.stringify({ type: "event", event: { type, ...payload } }));
      }
      return;
    }
    if (!this.state.server || !this.state.coalescer) return;
    const mapped = mapEvent(type, payload);
    if (!mapped.fields) return;
    this.state.coalescer.push(makeEvent(type, mapped.fields) as unknown as Record<string, unknown>);
    if (mapped.refreshState) this.pushState();
  }

  pushState(): void {
    if (!this.state.server || !this.state.coalescer || !this.state.ctx) return;
    const snapshot = this.buildStateSnapshot();
    if (!snapshot) return;
    this.state.coalescer.push(makeEvent("state", snapshot) as unknown as Record<string, unknown>);
  }

  drain(): void {
    if (!this.state.coalescer || !this.state.server) return;
    const items = this.state.coalescer.drainDue(Date.now());
    for (const item of items) this.state.server.broadcast(serialize(item));
  }

  buildStateSnapshot(): Record<string, unknown> | null {
    const { ctx, api } = this.state;
    if (!ctx || !api) return null;
    const usage = ctx.getContextUsage();
    const model = ctx.model
      ? {
          provider: ctx.model.provider,
          id: ctx.model.id,
          name: ctx.model.name,
          reasoning: ctx.model.reasoning,
          thinkingLevelMap: (ctx.model as { thinkingLevelMap?: Record<string, string | null> | null }).thinkingLevelMap ?? null,
        }
      : null;
    return buildState({
      sessionFile: ctx.sessionManager.getSessionFile() ?? null,
      sessionId: ctx.sessionManager.getSessionId() ?? null,
      sessionName: api.getSessionName(),
      model,
      thinkingLevel: api.getThinkingLevel(),
      isStreaming: !ctx.isIdle(),
      contextUsage: usage ? { tokens: usage.tokens, contextWindow: usage.contextWindow, percent: usage.percent } : null,
      messageCount: ctx.sessionManager.getEntries().length,
      allThinkingLevels: ALL_THINKING_LEVELS,
    }) as unknown as Record<string, unknown>;
  }

  // -------------------------------------------------------------------------
  // ctx.ui 桥接（notify / setStatus / setWidget 透传；不阻塞原调用）
  // -------------------------------------------------------------------------

  wrapUiBridge(ctx: ExtensionContext): void {
    const ui = ctx.ui as unknown as Record<string, unknown>;
    if (!ui || typeof ui !== "object" || (ui as Record<symbol, unknown>)[UI_BRIDGE_WRAP]) return;

    const wrap = (method: string) => {
      const orig = ui[method];
      if (typeof orig !== "function") return;
      ui[method] = (...args: unknown[]) => {
        try {
          this.broadcast(method, toBridgePayload(method, args));
        } catch {
          /* 桥接失败不影响原调用 */
        }
        return (orig as (...a: unknown[]) => unknown).apply(ui, args);
      };
    };

    wrap("notify");
    wrap("setStatus");
    wrap("setWidget");
    Object.defineProperty(ui, UI_BRIDGE_WRAP, { value: true, enumerable: false, configurable: false });
  }

  /** RPC 请求处理（interface/rpc-handler 注册进 handleRequest） */
  handleRequest: (id: string | number, method: string, params: Record<string, unknown>) => Promise<unknown> = async () => {
    throw new WebServerError(-32601, "RPC 处理器未注册");
  };

  // -------------------------------------------------------------------------
  // 浏览器打开
  // -------------------------------------------------------------------------

  async openBrowser(url: string): Promise<void> {
    const api = this.state.api;
    const run = (cmd: string, args: string[]) => api?.exec(cmd, args).catch(() => undefined);
    if (process.env.TERMUX_VERSION) {
      await run("termux-open-url", [url]);
      return;
    }
    if (process.platform === "darwin") {
      await run("open", [url]);
      return;
    }
    if (process.platform === "linux") {
      await run("xdg-open", [url]);
      return;
    }
    // 未知平台：仅打印 URL（命令输出处已 notify）
  }
}

export { SessionManager };

function toBridgePayload(method: string, args: unknown[]): Record<string, unknown> {
  if (method === "notify") {
    return { message: String(args[0] ?? ""), notifyType: String(args[1] ?? "info") };
  }
  if (method === "setStatus") {
    return { statusKey: String(args[0] ?? ""), statusText: args[1] === undefined ? null : String(args[1]) };
  }
  if (method === "setWidget") {
    return {
      widgetKey: String(args[0] ?? ""),
      widgetLines: Array.isArray(args[1]) ? (args[1] as string[]) : null,
      widgetPlacement: String((args[2] as { placement?: string } | undefined)?.placement ?? "aboveEditor"),
    };
  }
  return {};
}

export type { BuildSystemPromptOptions };
