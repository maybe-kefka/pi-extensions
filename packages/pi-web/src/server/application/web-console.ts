/**
 * WebConsole 应用服务（DDD application 层，无单测——薄编排，行为经 /web 冒烟验证）。
 * 职责：WebConsole 生命周期（启动/停止）、事件广播、状态快照、特权续链、ctx.ui 桥接。
 * 不直接做 RPC 派发（interface/rpc-handler）与传输细节（infrastructure/server）。
 */

import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SessionManager,
  type BuildSystemPromptOptions,
  type ExtensionAPI,
  type ExtensionCommandContext,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { createCoalescer, type Coalescer } from "../infrastructure/coalescer.js";
import { startWebServer, WebServerError, type WebServerHandle } from "../infrastructure/server.js";
import { makeEvent, serialize } from "../domain/protocol.js";
import { buildState } from "../domain/state.js";
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

  /** 启动服务（幂等：已在运行时返回 false 由命令层提示） */
  async start(port: number, open: boolean): Promise<{ url: string }> {
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
    });
    this.state.server = server;
    this.state.token = token;
    this.state.coalescer = createCoalescer(FLUSH_INTERVAL_MS);
    this.state.flushTimer = setInterval(() => this.drain(), FLUSH_INTERVAL_MS);
    this.pushState();
    if (open) await this.openBrowser(server.url);
    return { url: server.url };
  }

  async stop(): Promise<void> {
    if (this.state.flushTimer) {
      clearInterval(this.state.flushTimer);
      this.state.flushTimer = null;
    }
    this.state.coalescer = null;
    const server = this.state.server;
    this.state.server = null;
    this.state.token = "";
    if (server) await server.stop();
  }

  // -------------------------------------------------------------------------
  // 广播
  // -------------------------------------------------------------------------

  broadcast(type: string, payload: Record<string, unknown>): void {
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
