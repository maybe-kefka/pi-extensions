/**
 * pi-web 薄接线层（扩展入口，无单测）。
 *
 * 装配：WebConsole（application 服务编排）+ registerRpcHandler（interface RPC 派发）
 * + 生命周期订阅（session_start / session_shutdown / 事件广播）+ /web 命令注册。
 *
 * 生命周期要点（源码核实，SPEC §3.1）：
 * - new/resume/fork 切换会话时，扩展工厂会以全新 api 重跑（模块缓存只缓存导入，工厂体每次执行）→ 在此重绑 state.api/state.ctx；
 *   reload/quit 时模块重新求值，旧 server 句柄必然丢失 → session_shutdown(reload|quit) 关闭服务。
 * - 捕获的 pi/command ctx 在会话替换后失效（错误含 "stale"）→ 特权 ctx 捕获链：/web handler 捕获
 *   ExtensionCommandContext，web 发起的会话操作带 withSession 回调续链；TUI 手动切换后特权能力降级（code 1 错误提示重跑 /web）。
 * - 事件 ctx 每事件新建、getter 动态解析 → session_start 捕获的 ctx 在会话内一直有效；切换间隙 state.ctx 置空。
 * - 扩展 API 无命令派发入口（sendUserMessage 硬编码跳过命令处理）→ 不展示不派发扩展命令（SPEC §1.4 / §9）。
 */

import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { parseArgs, USAGE } from "./server/interface/args.js";
import { WebConsole, createWebConsole } from "./server/application/web-console.js";
import { registerRpcHandler } from "./server/interface/rpc-handler.js";
import { askAndWait, askRegistry, WEB_ASK_GUIDELINES } from "./server/domain/web-ask.js";
const BROADCAST_EVENT_TYPES = [
  "message_start",
  "message_update",
  "message_end",
  "tool_execution_start",
  "tool_execution_update",
  "tool_execution_end",
  "turn_start",
  "turn_end",
  "agent_start",
  "agent_end",
  "agent_settled",
  "queue_update",
  "session_before_switch",
  "session_shutdown",
  "session_start",
  "session_before_compact",
  "session_info_changed",
  "model_select",
  "thinking_level_select",
  "session_compact",
] as const;

/** R25：web 提问工具注册（进程级；照 pi-notify-termux ask 模式：execute 阻塞等待回答） */
function registerWebAskTools(pi: ExtensionAPI): void {
  // 参数/返回按 registerTool 泛型推断；kind 仅用于自文档（三个 execute 行为一致）
  const ask = (_kind: "single" | "multi" | "text") => async (
    toolCallId: string,
    _params: any,
    signal: AbortSignal | undefined,
  ) => askAndWait(askRegistry, toolCallId, signal);
  pi.registerTool({
    name: "web_ask_single",
    label: "向 web 用户提问（单选）",
    description:
      "通过 web 控制台向用户提出一个单选题（2-6 个选项）。阻塞等待用户回答（最长 10 分钟，回答自动回到上下文后继续）。适用于需要用户在有限选项中澄清/决策的场景。",
    promptSnippet: "Ask the user a single-choice question via the web console (waits for the answer)",
    promptGuidelines: [
      "Use web_ask_single when the user needs to pick from a finite set of choices (2-6 options) and the web console is open.",
      "Do not guess a decision the user should make — ask first via web_ask_single.",
    ],
    parameters: Type.Object({
      question: Type.String({ description: "要问的问题" }),
      options: Type.Array(Type.String(), { minItems: 2, maxItems: 6, description: "选项（2-6 个）" }),
    }),
    execute: ask("single"),
  });
  pi.registerTool({
    name: "web_ask_multi",
    label: "向 web 用户提问（多选）",
    description:
      "通过 web 控制台向用户提出一个多选题（1-8 个选项，可限制最多选择数）。阻塞等待用户回答（最长 10 分钟）。",
    promptSnippet: "Ask the user a multi-select question via the web console (waits for the answer)",
    promptGuidelines: [
      "Use web_ask_multi when the user should select several items from a list (1-8 options); set maxSelect when a limited number is required.",
    ],
    parameters: Type.Object({
      question: Type.String({ description: "要问的问题" }),
      options: Type.Array(Type.String(), { minItems: 1, maxItems: 8, description: "选项（1-8 个）" }),
      maxSelect: Type.Optional(Type.Number({ minimum: 1, description: "最多可选数量" })),
    }),
    execute: ask("multi"),
  });
  pi.registerTool({
    name: "web_ask_text",
    label: "向 web 用户提问（文本输入）",
    description:
      "通过 web 控制台向用户提出一个自由文本问题（短回答）。阻塞等待用户回答（最长 10 分钟）。适用于无法枚举选项的开放问题。",
    promptSnippet: "Ask the user a free-text question via the web console (waits for the answer)",
    promptGuidelines: [
      "Use web_ask_text for open-ended questions that cannot be enumerated as options; prefer single/multi when choices are finite.",
    ],
    parameters: Type.Object({
      question: Type.String({ description: "要问的问题" }),
      placeholder: Type.Optional(Type.String({ description: "输入框占位提示" })),
    }),
    execute: ask("text"),
  });
  // 每轮系统提示注入：引导 LLM 提问时优先使用 web_ask_*（照 pi-notify-termux confirm 注入）
  pi.on("before_agent_start", (event) => {
    return { systemPrompt: `${event.systemPrompt}

${WEB_ASK_GUIDELINES}` };
  });
}

// 模块级单例：factory 每次重跑（会话切换）时保留 server/token/coalescer/privileged 续链，
// 只重绑 api/ctx——RPC 闭包与事件广播始终指向同一实例（否则切换后广播断、RPC 用旧 api）
const webConsole = createWebConsole();

export default function (pi: ExtensionAPI): void {
  // multi-instance：扩展入口路径（spawn 新实例用——宿主/注册者都设置）
  webConsole.setExtensionPath(new URL(import.meta.url).pathname);

  // web 服务独立进程（pi-web bin 注入 PI_WEB_SERVICE）：rpc 模式常驻，只起服务，不注册自己、无会话 tab
  if (process.env.PI_WEB_SERVICE === "1") {
    if (!webConsole.isRunning()) {
      void webConsole.start(0, false, process.cwd(), false).catch((err) => {
        console.error(`[pi-web] 服务启动失败：${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      });
    }
  }

  // multi-instance：spawn 实例自动注册（宿主注入的环境变量）——不等 /web
  webConsole.autoRegisterIfNeeded(process.cwd());

  // 幂等：重复注册只覆盖 handleRequest 闭包（引用的仍是单例 state）
  registerRpcHandler(webConsole);

  // R25：web 提问工具（阻塞等待回答）
  registerWebAskTools(pi);

  // 每次 factory 运行（startup / 会话切换）都重绑当前 api
  webConsole.bindApi(pi);

  // ---- 会话生命周期 ----
  pi.on("session_start", (_event, ctx) => {
    webConsole.bindCtx(ctx);
    // multi-instance：agent 模式会话信息变化 → 重发 hello（宿主更新 sessionFile/name）
    if (webConsole.isAgent()) {
      webConsole.refreshAgentHello();
    }
    if (webConsole.isRunning()) {
      // R26 session-follow：切换后主动探测特权有效性（TUI 切换 → stale → 降级提示立即生效；
      // web 内切换 → withSession 续链 → ok，不降级）
      // ④ 探测+清 stale 收进 WebConsole 方法（领域逻辑不进接线层）
      const ok = webConsole.probePrivilegedStatus();
      broadcast(webConsole, "privilege_status", { ok });
      broadcast(webConsole, "session_switch_ready", {});
      webConsole.pushState();
    }
  });

  pi.on("session_shutdown", (event) => {
    webConsole.state.ctx = null;
    if (event.reason === "reload" || event.reason === "quit") {
      void webConsole.stop();
    }
  });

  // ---- 事件 → 广播 ----
  const on = pi.on as unknown as (type: string, handler: (event: Record<string, unknown>) => void) => void;
  for (const type of BROADCAST_EVENT_TYPES) {
    on(type, (event) => {
      broadcast(webConsole, type, event);
    });
  }

  // ---- /web 命令 ----
  pi.registerCommand("web", {
    description: "启动/显示本地 web 控制台（--port <n> | --open | --stop）",
    handler: async (args: string | undefined, ctx: ExtensionCommandContext) => {
      // 特权 ctx 捕获链：命令执行时拿到完整 ExtensionCommandContext（含 switchSession/newSession/fork/navigateTree）
      webConsole.setPrivileged(ctx);
      const parsed = parseArgs(args);
      if (!parsed.ok) {
        ctx.ui.notify(parsed.error, "error");
        return;
      }
      const opts = parsed.value;
      const cwd = ctx.sessionManager.getCwd();

      if (opts.stop) {
        if (!webConsole.isRunning()) {
          ctx.ui.notify("web 服务未在运行", "info");
          return;
        }
        await webConsole.stop();
        ctx.ui.notify("web 服务已停止", "info");
        return;
      }

      if (webConsole.isRunning()) {
        // 本进程已是宿主：显示已有服务（或注册进共享实例）
        if (webConsole.isAgent()) {
          ctx.ui.notify(webConsole.agentHostUrl() ?? "已连接共享 web 服务", "info");
          return;
        }
        if (opts.port !== 0 && opts.port !== webConsole.port) {
          ctx.ui.notify(`已在 ${webConsole.url} 运行；请先 /web --stop 再换端口`, "error");
          return;
        }
        // R26 session-follow：重跑 /web → 特权重新捕获 → 广播恢复（前端自动清降级提示）
        broadcast(webConsole, "privilege_status", { ok: true });
        ctx.ui.notify(webConsole.url ?? "", "info");
        if (opts.open) await webConsole.openBrowser(webConsole.url ?? "");
        return;
      }

      try {
        const { url, mode } = await webConsole.startOrConnect(cwd, opts.port, opts.open);
        ctx.ui.notify(mode === "agent" ? `已连接共享 web 控制台：${url}` : url, "info");
        if (opts.open) await webConsole.openBrowser(url);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        ctx.ui.notify(message, "error");
      }
    },
  });
}

function broadcast(console: ReturnType<typeof createWebConsole>, type: string, payload: Record<string, unknown>): void {
  console.broadcast(type, payload);
}
