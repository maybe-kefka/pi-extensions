/** 聊天流状态机（纯 reducer，单测覆盖）。 */

export type ChatRole = "user" | "assistant" | "toolResult";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  /** 最终文本；assistant 流式时持续累积 */
  text: string;
  /** assistant 的 thinking 块（可折叠） */
  thinking: string;
  thinkingExpanded: boolean;
  /** 本消息 content 里声明的 toolCall 列表（对应 tools 列表渲染工具卡片） */
  toolCallIds: string[];
  toolName?: string;
  toolCallId?: string;
  toolArgs?: unknown;
  toolOutputExpanded: boolean;
  isError?: boolean;
  final: boolean;
  /** 是否仍在流式（assistant 未 message_end） */
  streaming?: boolean;
}

export interface ToolRow {
  toolCallId: string;
  toolName: string;
  args: unknown;
  output: string;
  isError: boolean;
  final: boolean;
  expanded: boolean;
}

export interface StreamState {
  messages: ChatMessage[];
  /** 当前流式 assistant 条目 id（message_update 追加目标） */
  currentAssistantId: string | null;
  /** 工具执行行（以 tool_execution_* 事件为准，忽略 toolResult message 事件避免重复） */
  tools: ToolRow[];
  streaming: boolean;
  queue: { steering: string[]; followUp: string[] };
  sessionFile: string | null;
  sessionName: string | null;
  sessionReason: string | null;
  model: { provider: string; id: string; name: string | null } | null;
  thinkingLevel: string | null;
  availableThinkingLevels: string[];
  context: { tokens: number | null; contextWindow: number | null; percent: number | null };
  messageCount: number;
  bridge: {
    status: Record<string, string>;
    widget: { key: string; lines: string[] } | null;
    notifies: { id: number; message: string; type: string }[];
  };
  conn: "connecting" | "open" | "closed";
}

export type StreamAction =
  | { type: "conn"; state: StreamState["conn"] }
  | {
      type: "history";
      messages: {
        role: string;
        text: string;
        thinking?: string;
        toolCalls?: { id: string; name: string; arguments: unknown; result?: string; isError?: boolean }[];
      }[];
    }
  | { type: "message_start"; message: { role?: string; content?: unknown; toolName?: string } }
  | {
      type: "message_update";
      event: {
        type?: string;
        delta?: string;
        partial?: { thinking?: string };
        contentIndex?: number;
      };
    }
  | { type: "message_end"; message: { role?: string; content?: unknown } }
  | {
      type: "tool_start";
      toolCallId: string;
      toolName: string;
      args: unknown;
    }
  | {
      type: "tool_update";
      toolCallId: string;
      partialResult: { content?: unknown } | null;
    }
  | {
      type: "tool_end";
      toolCallId: string;
      result: { content?: unknown } | null;
      isError: boolean;
    }
  | { type: "agent_start" }
  | { type: "agent_end"; willRetry?: boolean }
  | { type: "agent_settled" }
  | { type: "queue_update"; steering: string[]; followUp: string[] }
  | { type: "state"; state: Record<string, unknown> }
  | { type: "session_start"; reason?: string }
  | { type: "session_shutdown"; reason?: string }
  | { type: "session_before_switch"; reason?: string }
  | { type: "session_switch_ready" }
  | { type: "notify"; message: string; notifyType: string }
  | { type: "setStatus"; statusKey: string; statusText: string | null }
  | { type: "setWidget"; widgetKey: string; widgetLines: string[] | null }
  | { type: "toggle_thinking"; id: string };

export const initialState: StreamState = {
  messages: [],
  currentAssistantId: null,
  tools: [],
  streaming: false,
  queue: { steering: [], followUp: [] },
  sessionFile: null,
  sessionName: null,
  sessionReason: null,
  model: null,
  thinkingLevel: null,
  availableThinkingLevels: ["off", "minimal", "low", "medium", "high", "xhigh", "max"],
  context: { tokens: null, contextWindow: null, percent: null },
  messageCount: 0,
  bridge: { status: {}, widget: null, notifies: [] },
  conn: "closed",
};

let seq = 0;
function nextId(): string {
  seq += 1;
  return `m${seq}`;
}

export function textOfContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((b) => (b && typeof b === "object" && "text" in (b as object) ? ((b as { text: unknown }).text as string) : ""))
    .filter((s) => s.length > 0)
    .join("\n");
}

/** 提取 content 里 toolCall 块的 id（顺序保持） */
export function toolCallIdsOf(content: unknown): string[] {
  if (!Array.isArray(content)) return [];
  const ids: string[] = [];
  for (const b of content) {
    if (b && typeof b === "object" && (b as { type?: unknown }).type === "toolCall") {
      const id = (b as { id?: unknown }).id;
      if (id != null) ids.push(String(id));
    }
  }
  return ids;
}

function updateMessage(state: StreamState, id: string, patch: Partial<ChatMessage>): StreamState {
  return { ...state, messages: state.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)) };
}

export function streamReducer(state: StreamState, action: StreamAction): StreamState {
  switch (action.type) {
    case "conn":
      return { ...state, conn: action.state };

    case "history": {
      const msgs: ChatMessage[] = [];
      const tools: ToolRow[] = [];
      let i = 0;
      for (const m of action.messages) {
        if (m.role !== "user" && m.role !== "assistant") continue;
        const toolCalls = m.toolCalls ?? [];
        // 空消息（无 text 无 thinking 无工具）数据层筛掉（服务端已筛，这里防御）
        if (m.role === "assistant" && !m.text && !(m.thinking ?? "") && toolCalls.length === 0) continue;
        msgs.push({
          id: `h${i++}`,
          role: m.role as ChatRole,
          text: m.text,
          thinking: m.thinking ?? "",
          thinkingExpanded: false,
          toolCallIds: toolCalls.map((t) => t.id),
          toolOutputExpanded: false,
          final: true,
        });
        for (const tc of toolCalls) {
          tools.push({
            toolCallId: tc.id,
            toolName: tc.name,
            args: tc.arguments,
            output: tc.result ?? "",
            isError: tc.isError ?? false,
            final: true,
            expanded: false,
          });
        }
      }
      return { ...state, messages: msgs, tools, currentAssistantId: null };
    }

    case "message_start": {
      const role = (action.message.role ?? "unknown") as ChatRole;
      // toolResult 消息事件忽略（tools 列表以 tool_execution_* 为准）
      if (role === "toolResult") return state;
      const id = nextId();
      const text = textOfContent(action.message.content);
      const msg: ChatMessage = {
        id,
        role,
        text,
        thinking: "",
        thinkingExpanded: false,
        toolCallIds: toolCallIdsOf(action.message.content),
        toolOutputExpanded: false,
        final: role !== "assistant",
        streaming: role === "assistant",
      };
      return {
        ...state,
        messages: [...state.messages, msg],
        currentAssistantId: role === "assistant" ? id : state.currentAssistantId,
      };
    }

    case "message_update": {
      const evt = action.event ?? {};
      if (evt.type === "text_delta") {
        if (!state.currentAssistantId) return state;
        const target = state.messages.find((m) => m.id === state.currentAssistantId);
        if (!target || target.role !== "assistant") return state;
        return updateMessage(state, target.id, { text: target.text + (evt.delta ?? "") });
      }
      if (evt.type === "thinking_delta") {
        if (!state.currentAssistantId) return state;
        const target = state.messages.find((m) => m.id === state.currentAssistantId);
        if (!target || target.role !== "assistant") return state;
        const partialThinking = evt.partial?.thinking;
        return updateMessage(state, target.id, {
          thinking: partialThinking ?? target.thinking + (evt.delta ?? ""),
        });
      }
      return state;
    }

    case "message_end": {
      if (action.message.role !== "assistant") return state;
      if (!state.currentAssistantId) return state;
      const finalText = textOfContent(action.message.content);
      const ids = toolCallIdsOf(action.message.content);
      const target = state.messages.find((m) => m.id === state.currentAssistantId);
      // 空消息（无 text、无 thinking、无工具）→ 数据层直接筛掉，不留在消息流
      if (!finalText && !target?.thinking && ids.length === 0) {
        return {
          ...state,
          messages: state.messages.filter((m) => m.id !== state.currentAssistantId),
          currentAssistantId: null,
        };
      }
      const withIds =
        ids.length > 0 ? updateMessage(state, state.currentAssistantId, { toolCallIds: ids }) : state;
      const withText = finalText ? updateMessage(withIds, state.currentAssistantId, { text: finalText }) : withIds;
      return {
        ...updateMessage(withText, state.currentAssistantId, { final: true, streaming: false }),
        currentAssistantId: null,
      };
    }

    case "tool_start": {
      const row: ToolRow = {
        toolCallId: action.toolCallId,
        toolName: action.toolName,
        args: action.args,
        output: "",
        isError: false,
        final: false,
        expanded: false,
      };
      const existing = state.tools.find((t) => t.toolCallId === action.toolCallId);
      return {
        ...state,
        tools: existing ? state.tools.map((t) => (t.toolCallId === action.toolCallId ? { ...t, args: action.args } : t)) : [...state.tools, row],
      };
    }

    case "tool_update": {
      const text = textOfContent(action.partialResult?.content);
      if (!text) return state;
      return {
        ...state,
        tools: state.tools.map((t) =>
          t.toolCallId === action.toolCallId ? { ...t, output: text } : t,
        ),
      };
    }

    case "tool_end": {
      const text = textOfContent(action.result?.content);
      return {
        ...state,
        tools: state.tools.map((t) =>
          t.toolCallId === action.toolCallId
            ? { ...t, output: text || t.output, isError: action.isError, final: true }
            : t,
        ),
      };
    }

    case "agent_start":
      return { ...state, streaming: true };

    case "agent_end":
      return { ...state, streaming: action.willRetry ? true : false };

    case "agent_settled":
      return { ...state, streaming: false };

    case "queue_update":
      return {
        ...state,
        queue: { steering: action.steering ?? [], followUp: action.followUp ?? [] },
      };

    case "state": {
      const s = action.state as Record<string, unknown>;
      const ctx = (s.context ?? state.context) as StreamState["context"];
      return {
        ...state,
        streaming: typeof s.isStreaming === "boolean" ? s.isStreaming : state.streaming,
        sessionFile: (s.sessionFile as string) ?? state.sessionFile,
        sessionName: (s.sessionName as string) ?? state.sessionName,
        model: (s.model as StreamState["model"]) ?? state.model,
        thinkingLevel: (s.thinkingLevel as string) ?? state.thinkingLevel,
        availableThinkingLevels:
          Array.isArray(s.availableThinkingLevels) && s.availableThinkingLevels.length > 0
            ? (s.availableThinkingLevels as string[])
            : state.availableThinkingLevels,
        context: ctx ?? state.context,
        messageCount: typeof s.messageCount === "number" ? s.messageCount : state.messageCount,
      };
    }

    case "session_start":
      return {
        ...state,
        sessionReason: action.reason ?? "startup",
        // 会话切换 → 清空旧会话消息与工具
        messages: [],
        tools: [],
        currentAssistantId: null,
      };

    case "session_shutdown":
      return { ...state, sessionReason: `shutdown:${action.reason ?? ""}` };

    case "session_before_switch":
      return { ...state, sessionReason: `switching:${action.reason ?? ""}` };

    case "session_switch_ready":
      return { ...state };

    case "notify":
      return {
        ...state,
        bridge: {
          ...state.bridge,
          notifies: [
            { id: Date.now() + Math.random(), message: action.message, type: action.notifyType },
            ...state.bridge.notifies,
          ].slice(0, 6),
        },
      };

    case "setStatus": {
      const status = { ...state.bridge.status };
      if (action.statusText === null) delete status[action.statusKey];
      else status[action.statusKey] = action.statusText;
      return { ...state, bridge: { ...state.bridge, status } };
    }

    case "setWidget":
      return {
        ...state,
        bridge: {
          ...state.bridge,
          widget:
            action.widgetLines && action.widgetLines.length > 0
              ? { key: action.widgetKey, lines: action.widgetLines }
              : null,
        },
      };

    case "toggle_thinking":
      return {
        ...state,
        messages: state.messages.map((m) =>
          m.id === action.id ? { ...m, thinkingExpanded: !m.thinkingExpanded } : m,
        ),
      };

    default:
      return state;
  }
}
