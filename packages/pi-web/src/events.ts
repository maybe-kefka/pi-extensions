/**
 * pi 事件 → 协议事件载荷映射（纯函数）。
 * SPEC §4.2 / §4.3。
 */

export interface MappedEvent {
  /** notification params 载荷（不含 type 字段）；null = 丢弃 */
  fields: Record<string, unknown> | null;
  /** 是否应附带推送一次 state 刷新 */
  refreshState: boolean;
}

const STATE_REFRESH_TYPES = new Set([
  "session_start",
  "session_info_changed",
  "model_select",
  "thinking_level_select",
  "session_compact",
  "message_end",
  "agent_start",
  "agent_end",
  "agent_settled",
]);

export function requiresStateRefresh(type: string): boolean {
  return STATE_REFRESH_TYPES.has(type);
}

type Dict = Record<string, unknown>;

function asDict(payload: unknown): Dict {
  return typeof payload === "object" && payload !== null ? (payload as Dict) : {};
}

export function mapEvent(type: string, payload: unknown): MappedEvent {
  const p = asDict(payload);

  switch (type) {
    case "message_start":
      return { fields: { message: p.message ?? null }, refreshState: false };
    case "message_end":
      return { fields: { message: p.message ?? null }, refreshState: true };
    // message_update 只透传 delta 事件（含 partial），裁剪掉整份 message 与 usage
    case "message_update":
      return { fields: { event: p.assistantMessageEvent ?? null }, refreshState: false };

    case "tool_execution_start":
      return {
        fields: { toolCallId: p.toolCallId, toolName: p.toolName, args: p.args ?? null },
        refreshState: false,
      };
    case "tool_execution_update":
      return {
        fields: { toolCallId: p.toolCallId, toolName: p.toolName, partialResult: p.partialResult ?? null },
        refreshState: false,
      };
    case "tool_execution_end":
      return {
        fields: { toolCallId: p.toolCallId, toolName: p.toolName, result: p.result ?? null, isError: p.isError === true },
        refreshState: false,
      };

    case "agent_start":
      return { fields: {}, refreshState: true };
    case "agent_end":
      return { fields: { willRetry: p.willRetry === true }, refreshState: true };
    case "agent_settled":
      return { fields: {}, refreshState: true };

    case "queue_update":
      return {
        fields: { steering: Array.isArray(p.steering) ? p.steering : [], followUp: Array.isArray(p.followUp) ? p.followUp : [] },
        refreshState: false,
      };

    case "session_before_switch":
      return { fields: { reason: p.reason, targetSessionFile: p.targetSessionFile ?? null }, refreshState: false };
    case "session_shutdown":
      return { fields: { reason: p.reason, targetSessionFile: p.targetSessionFile ?? null }, refreshState: false };
    case "session_start":
      return { fields: { reason: p.reason, previousSessionFile: p.previousSessionFile ?? null }, refreshState: true };

    case "session_info_changed":
      return { fields: { name: p.name ?? null }, refreshState: true };
    case "model_select":
      return {
        fields: { model: p.model ?? null, previousModel: p.previousModel ?? null, source: p.source ?? null },
        refreshState: true,
      };
    case "thinking_level_select":
      return { fields: { level: p.level ?? null, previousLevel: p.previousLevel ?? null }, refreshState: true };
    case "session_compact":
      return { fields: { reason: p.reason ?? null, fromExtension: p.fromExtension === true }, refreshState: true };

    // ctx.ui 桥接（包装器调用，非 pi 事件）
    case "notify":
      return { fields: { message: p.message ?? null, notifyType: p.notifyType ?? "info" }, refreshState: false };
    case "setStatus":
      return { fields: { statusKey: p.statusKey ?? null, statusText: p.statusText ?? null }, refreshState: false };
    case "setWidget":
      return {
        fields: {
          widgetKey: p.widgetKey ?? null,
          widgetLines: Array.isArray(p.widgetLines) ? p.widgetLines : null,
          widgetPlacement: p.widgetPlacement ?? "aboveEditor",
        },
        refreshState: false,
      };

    default:
      return { fields: null, refreshState: false };
  }
}
