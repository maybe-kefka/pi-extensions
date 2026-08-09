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
import { parseArgs, USAGE } from "./server/interface/args.js";
import { createWebConsole } from "./server/application/web-console.js";
import { registerRpcHandler } from "./server/interface/rpc-handler.js";

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
  "session_info_changed",
  "model_select",
  "thinking_level_select",
  "session_compact",
] as const;

export default function (pi: ExtensionAPI): void {
  const console = createWebConsole();
  registerRpcHandler(console);

  // 每次 factory 运行（startup / 会话切换）都重绑当前 api
  console.bindApi(pi);

  // ---- 会话生命周期 ----
  pi.on("session_start", (_event, ctx) => {
    console.bindCtx(ctx);
    if (console.isRunning()) {
      broadcast(console, "session_switch_ready", {});
      console.pushState();
    }
  });

  pi.on("session_shutdown", (event) => {
    console.state.ctx = null;
    if (event.reason === "reload" || event.reason === "quit") {
      void console.stop();
    }
  });

  // ---- 事件 → 广播 ----
  const on = pi.on as unknown as (type: string, handler: (event: Record<string, unknown>) => void) => void;
  for (const type of BROADCAST_EVENT_TYPES) {
    on(type, (event) => {
      broadcast(console, type, event);
    });
  }

  // ---- /web 命令 ----
  pi.registerCommand("web", {
    description: "启动/显示本地 web 控制台（--port <n> | --open | --stop）",
    handler: async (args: string | undefined, ctx: ExtensionCommandContext) => {
      // 特权 ctx 捕获链：命令执行时拿到完整 ExtensionCommandContext（含 switchSession/newSession/fork/navigateTree）
      console.setPrivileged(ctx);
      const parsed = parseArgs(args);
      if (!parsed.ok) {
        ctx.ui.notify(parsed.error, "error");
        return;
      }
      const opts = parsed.value;

      if (opts.stop) {
        if (!console.isRunning()) {
          ctx.ui.notify("web 服务未在运行", "info");
          return;
        }
        await console.stop();
        ctx.ui.notify("web 服务已停止", "info");
        return;
      }

      if (console.isRunning()) {
        if (opts.port !== 0 && opts.port !== console.port) {
          ctx.ui.notify(`已在 ${console.url} 运行；请先 /web --stop 再换端口`, "error");
          return;
        }
        ctx.ui.notify(console.url ?? "", "info");
        if (opts.open) await console.openBrowser(console.url ?? "");
        return;
      }

      try {
        const { url } = await console.start(opts.port, opts.open);
        ctx.ui.notify(url, "info");
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
