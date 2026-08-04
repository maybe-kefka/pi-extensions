/**
 * pi-web 薄接线层（无单测）。
 *
 * 生命周期要点（源码核实）：
 * - new/resume/fork 切换会话时，扩展模块**不重新求值**（factory 缓存），模块级 state 存活；
 *   factory 会以全新 api 重跑 → 在此重绑 state.api。
 * - reload/quit 时模块重新求值，旧 server 句柄必然丢失 → session_shutdown(reload|quit) 关闭服务。
 * - ctx 只在 session dispose 时失效（runner.assertActive），session_start 捕获的 ctx 在会话内一直有效；
 *   切换间隙 state.ctx 置空，WS 请求返回"会话切换中"。
 * - 扩展 API 无命令派发入口（sendUserMessage 硬编码跳过命令处理）→ 不提供执行任意命令；
 *   会话控制（switchSession/newSession）仅存在于命令上下文 → web 端不可用，见 handleRequest。
 */

import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SessionManager, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { parseArgs, USAGE, type WebArgs } from "./args.js";
import { createCoalescer, type Coalescer } from "./coalescer.js";
import { mapEvent, requiresStateRefresh } from "./events.js";
import { makeEvent, serialize } from "./protocol.js";
import { startWebServer, WebServerError, type WebServerHandle } from "./server.js";
import { buildState } from "./state.js";

const WEB_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "web", "dist");
const FLUSH_INTERVAL_MS = 60;
const MAX_CLIENTS = 16;
const UI_BRIDGE_WRAP = Symbol("pi-web.ui-bridge-wrapped");

const BROADCAST_EVENT_TYPES = [
  "message_start",
  "message_update",
  "message_end",
  "tool_execution_start",
  "tool_execution_update",
  "tool_execution_end",
  "agent_start",
  "agent_end",
  "agent_settled",
  "queue_update",
  "session_before_switch",
  "session_shutdown",
  "session_start",
  "session_info_changed",
  "model_select",
  "thinking_level_select",
  "session_compact",
] as const;

interface ServerState {
  server: WebServerHandle | null;
  token: string;
  /** 当前会话 api（factory 每次重跑时重绑） */
  api: ExtensionAPI | null;
  /** 当前会话 ctx（session_start 捕获；切换间隙为 null） */
  ctx: ExtensionContext | null;
  coalescer: Coalescer<Record<string, unknown>> | null;
  flushTimer: ReturnType<typeof setInterval> | null;
}

const state: ServerState = {
  server: null,
  token: "",
  api: null,
  ctx: null,
  coalescer: null,
  flushTimer: null,
};

const THINKING_LEVELS = new Set(["off", "minimal", "low", "medium", "high", "xhigh", "max"]);
const ALL_THINKING_LEVELS = [...THINKING_LEVELS];

export default function (pi: ExtensionAPI): void {
  // 每次 factory 运行（startup / 会话切换）都重绑当前 api
  state.api = pi;

  // ---- 会话生命周期 ----
  pi.on("session_start", (_event, ctx) => {
    state.ctx = ctx;
    wrapUiBridge(ctx);
    if (state.server) {
      broadcastEvent("session_switch_ready", {});
      pushStateEvent();
    }
  });

  pi.on("session_shutdown", (event) => {
    state.ctx = null;
    if (event.reason === "reload" || event.reason === "quit") {
      void stopServer();
    }
  });

  // ---- 事件 → 广播 ----
  const on = pi.on as unknown as (type: string, handler: (event: Record<string, unknown>) => void) => void;
  for (const type of BROADCAST_EVENT_TYPES) {
    on(type, (event) => {
      broadcastEvent(type, event);
    });
  }

  // ---- /web 命令 ----
  pi.registerCommand("web", {
    description: "启动/显示本地 web 控制台（--port <n> | --open | --stop）",
    handler: async (args, ctx) => {
      const parsed = parseArgs(args);
      if (!parsed.ok) {
        ctx.ui.notify(parsed.error, "error");
        return;
      }
      const opts: WebArgs = parsed.value;

      if (opts.stop) {
        if (!state.server) {
          ctx.ui.notify("web 服务未在运行", "info");
          return;
        }
        await stopServer();
        ctx.ui.notify("web 服务已停止", "info");
        return;
      }

      if (state.server) {
        if (opts.port !== 0 && opts.port !== state.server.port) {
          ctx.ui.notify(`已在 ${state.server.url} 运行；请先 /web --stop 再换端口`, "error");
          return;
        }
        ctx.ui.notify(state.server.url, "info");
        if (opts.open) await openBrowser(state.server.url);
        return;
      }

      const token = randomBytes(24).toString("hex");
      if (!existsSync(join(WEB_DIR, "index.html"))) {
        ctx.ui.notify("前端未构建：请先运行 npm run build:web（构建到 web/dist）", "error");
        return;
      }
      const server = await startWebServer({
        port: opts.port,
        token,
        webDir: WEB_DIR,
        handleRequest,
        maxClients: MAX_CLIENTS,
        onClientChange: (count) => {
          state.ctx?.ui.setStatus("pi-web", count > 0 ? `web 客户端: ${count}` : undefined);
        },
      });
      state.server = server;
      state.token = token;
      state.coalescer = createCoalescer(FLUSH_INTERVAL_MS);
      state.flushTimer = setInterval(() => drainCoalescer(), FLUSH_INTERVAL_MS);

      ctx.ui.notify(server.url, "info");
      pushStateEvent();
      if (opts.open) await openBrowser(server.url);
    },
  });
}

// ---------------------------------------------------------------------------
// 广播
// ---------------------------------------------------------------------------

function broadcastEvent(type: string, payload: Record<string, unknown>): void {
  if (!state.server || !state.coalescer) return;
  const mapped = mapEvent(type, payload);
  if (!mapped.fields) return;
  state.coalescer.push(makeEvent(type, mapped.fields) as unknown as Record<string, unknown>);
  if (mapped.refreshState) pushStateEvent();
}

function pushStateEvent(): void {
  if (!state.server || !state.coalescer || !state.ctx) return;
  const snapshot = buildStateSnapshot();
  if (!snapshot) return;
  state.coalescer.push(makeEvent("state", snapshot) as unknown as Record<string, unknown>);
}

function drainCoalescer(): void {
  if (!state.coalescer || !state.server) return;
  const items = state.coalescer.drainDue(Date.now());
  for (const item of items) state.server.broadcast(serialize(item));
}

function buildStateSnapshot(): Record<string, unknown> | null {
  const { ctx, api } = state;
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

// ---------------------------------------------------------------------------
// ctx.ui 桥接（notify / setStatus / setWidget 透传；不阻塞原调用）
// ---------------------------------------------------------------------------

function wrapUiBridge(ctx: ExtensionContext): void {
  const ui = ctx.ui as unknown as Record<string, unknown>;
  if (!ui || typeof ui !== "object" || (ui as Record<symbol, unknown>)[UI_BRIDGE_WRAP]) return;

  const wrap = (method: string) => {
    const orig = ui[method];
    if (typeof orig !== "function") return;
    ui[method] = (...args: unknown[]) => {
      try {
        broadcastEvent(method, toBridgePayload(method, args));
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

// ---------------------------------------------------------------------------
// WS 请求处理
// ---------------------------------------------------------------------------

async function handleRequest(id: string | number, method: string, params: Record<string, unknown>): Promise<unknown> {
  switch (method) {
    case "pi:sendMessage": {
      const text = params.text;
      if (typeof text !== "string" || text.trim() === "") {
        throw new WebServerError(-32602, "text 必须是非空字符串");
      }
      const deliverAs = params.deliverAs;
      if (deliverAs !== undefined && deliverAs !== "steer" && deliverAs !== "followUp") {
        throw new WebServerError(-32602, "deliverAs 只能是 steer 或 followUp");
      }
      if (!state.api) throw new WebServerError(3, "扩展未就绪");
      try {
        state.api.sendUserMessage(text.trim(), deliverAs ? { deliverAs } : undefined);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes("Agent is already processing")) {
          throw new WebServerError(2, `agent 正在处理，请指定 deliverAs（"steer" 打断 / "followUp" 排队）`);
        }
        throw new WebServerError(1, message);
      }
      return null;
    }

    case "pi:abort": {
      requireCtx().abort();
      return null;
    }

    case "pi:listSessions": {
      const ctx = requireCtx();
      const sessions = await SessionManager.list(ctx.cwd);
      return sessions.map((s) => ({
        path: s.path,
        name: s.name ?? null,
        cwd: s.cwd,
        messageCount: s.messageCount,
        firstMessage: s.firstMessage,
        modified: s.modified.toISOString(),
      }));
    }

    case "pi:switchSession":
    case "pi:newSession":
      // 已知限制（SPEC §9）：会话控制仅存在于命令上下文（ExtensionCommandContext），
      // 扩展 API 无命令派发入口，web 端无法编程式切换会话。
      throw new WebServerError(
        1,
        "会话切换仅支持在 TUI 中执行（/resume、/new）；扩展 API 未暴露程序化会话控制（上游 feature 建议见 SPEC §9）",
      );

    case "pi:listModels": {
      const ctx = requireCtx();
      return ctx.modelRegistry
        .getAvailable()
        .map((m) => ({ provider: m.provider, id: m.id, name: m.name ?? m.id }));
    }

    case "pi:setModel": {
      const provider = params.provider;
      const modelId = params.modelId;
      if (typeof provider !== "string" || typeof modelId !== "string") {
        throw new WebServerError(-32602, "需要 provider 与 modelId");
      }
      const ctx = requireCtx();
      const model = ctx.modelRegistry.find(provider, modelId);
      if (!model) throw new WebServerError(1, `模型不存在: ${provider}/${modelId}`);
      if (!state.api) throw new WebServerError(3, "扩展未就绪");
      const ok = await state.api.setModel(model);
      if (!ok) throw new WebServerError(1, "该模型无可用 API key");
      return { provider, modelId };
    }

    case "pi:getThinkingLevel": {
      if (!state.api) throw new WebServerError(3, "扩展未就绪");
      return { level: state.api.getThinkingLevel() };
    }

    case "pi:setThinkingLevel": {
      const level = params.level;
      if (typeof level !== "string" || !THINKING_LEVELS.has(level)) {
        throw new WebServerError(-32602, `level 必须是 ${[...THINKING_LEVELS].join("/")} 之一`);
      }
      if (!state.api) throw new WebServerError(3, "扩展未就绪");
      state.api.setThinkingLevel(level as never);
      return null;
    }

    case "pi:listCommands": {
      if (!state.api) throw new WebServerError(3, "扩展未就绪");
      return state.api
        .getCommands()
        .map((c) => ({ name: c.name, description: c.description ?? null, source: c.source }));
    }

    case "pi:getMessages": {
      const ctx = requireCtx();
      const entries = ctx.sessionManager.getEntries();
      const messages = entries
        .filter((e) => e.type === "message")
        .map((e) => {
          const msg = (e as { message?: { role?: string; content?: unknown } }).message;
          return { role: msg?.role ?? "unknown", text: messageText(msg?.content), thinking: messageThinking(msg?.content) };
        });
      return { messages };
    }

    case "pi:getState": {
      const snapshot = buildStateSnapshot();
      if (!snapshot) throw new WebServerError(3, "会话未就绪（切换中？），请重试");
      return snapshot;
    }

    default:
      throw new WebServerError(-32601, `未知方法: ${method}`);
  }
}

function requireCtx(): ExtensionContext {
  if (!state.ctx) throw new WebServerError(3, "会话未就绪（切换中？），请重试");
  return state.ctx;
}

function messageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((b) => (b && typeof b === "object" && "text" in (b as object) ? String((b as { text: unknown }).text) : ""))
    .join("\n");
}

/** 提取 assistant 消息的 thinking 块（content 里 type==="thinking"） */
function messageThinking(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .map((b) =>
      b && typeof b === "object" && (b as { type?: unknown }).type === "thinking" && "thinking" in (b as object)
        ? String((b as { thinking: unknown }).thinking)
        : "",
    )
    .join("\n");
}

// ---------------------------------------------------------------------------
// 服务启停 / 浏览器
// ---------------------------------------------------------------------------

async function stopServer(): Promise<void> {
  if (state.flushTimer) {
    clearInterval(state.flushTimer);
    state.flushTimer = null;
  }
  state.coalescer = null;
  const server = state.server;
  state.server = null;
  state.token = "";
  if (server) await server.stop();
}

async function openBrowser(url: string): Promise<void> {
  const api = state.api;
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
