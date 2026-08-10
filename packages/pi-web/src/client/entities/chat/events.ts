import type { StreamAction } from "./stream";
import type { PiEvent } from "./types";

/**
 * 服务器 pi:event → reducer action 映射（纯函数）。
 * R20：compact 事件此前漏映射（App.tsx toAction 缺 case）→ 事件被 default 丢弃，
 * 横幅/系统记录在真实应用中不生效。抽为 entities 层以单测覆盖。
 */
export function toAction(evt: PiEvent): StreamAction | null {
  switch (evt.type) {
    case "message_start":
      return { type: "message_start", message: (evt.message ?? {}) as { role?: string; content?: unknown } };
    case "message_update":
      return { type: "message_update", event: (evt.event ?? {}) as { type?: string; delta?: string; partial?: { thinking?: string } } };
    case "message_end":
      return { type: "message_end", message: (evt.message ?? {}) as { role?: string; content?: unknown } };
    case "tool_execution_start":
      return { type: "tool_start", toolCallId: String(evt.toolCallId), toolName: String(evt.toolName), args: evt.args };
    case "tool_execution_update":
      return { type: "tool_update", toolCallId: String(evt.toolCallId), partialResult: (evt.partialResult as { content?: unknown } | null) ?? null };
    case "tool_execution_end":
      return { type: "tool_end", toolCallId: String(evt.toolCallId), result: (evt.result as { content?: unknown } | null) ?? null, isError: evt.isError === true };
    case "turn_start":
      return { type: "turn_start" };
    case "turn_end":
      return { type: "turn_end" };
    case "agent_start":
      return { type: "agent_start" };
    case "agent_end":
      return { type: "agent_end", willRetry: evt.willRetry === true };
    case "agent_settled":
      return { type: "agent_settled" };
    case "queue_update":
      return { type: "queue_update", steering: (evt.steering as string[]) ?? [], followUp: (evt.followUp as string[]) ?? [] };
    case "state":
      return { type: "state", state: evt as Record<string, unknown> };
    case "session_start":
      return { type: "session_start", reason: evt.reason as string | undefined };
    case "session_shutdown":
      return { type: "session_shutdown", reason: evt.reason as string | undefined };
    case "session_before_switch":
      return { type: "session_before_switch", reason: evt.reason as string | undefined };
    case "session_switch_ready":
      return { type: "session_switch_ready" };
    case "privilege_status": {
      const ok = evt.ok;
      return { type: "privilege_status", ok: typeof ok === "boolean" ? ok : false };
    }
    case "session_before_compact":
      return {
        type: "session_before_compact",
        reason: evt.reason == null ? null : String(evt.reason),
        willRetry: evt.willRetry === true,
      };
    case "session_compact":
      return {
        type: "session_compact",
        reason: evt.reason == null ? null : String(evt.reason),
        willRetry: evt.willRetry === true,
        fromExtension: evt.fromExtension === true,
      };
    case "notify":
      return { type: "notify", message: String(evt.message ?? ""), notifyType: String(evt.notifyType ?? "info") };
    case "setStatus":
      return { type: "setStatus", statusKey: String(evt.statusKey ?? ""), statusText: evt.statusText == null ? null : String(evt.statusText) };
    case "setWidget":
      return { type: "setWidget", widgetKey: String(evt.widgetKey ?? ""), widgetLines: Array.isArray(evt.widgetLines) ? (evt.widgetLines as string[]) : null };
    default:
      return null;
  }
}

/**
 * R23 F5：高频流式 action 判定——包 startTransition 渲染（非紧急，避免阻塞输入/滚动）；
 * 消息边界/连接/历史等保持同步（滚动锚定与气泡边界即时）。
 * text_delta / thinking_delta 经 toAction 映射为 message_update（event.type 区分）。
 */
export function isTransitionalAction(action: StreamAction): boolean {
  if (action.type === "tool_update") return true;
  if (action.type === "message_update") {
    const t = action.event?.type;
    return t === "text_delta" || t === "thinking_delta";
  }
  return false;
}
