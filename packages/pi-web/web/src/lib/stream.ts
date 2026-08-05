/** 聊天流状态机（纯 reducer，单测覆盖）——轮次聚合气泡模型（SPEC §7）。 */

export interface Turn {
  /** 该 turn 最终文本（流式中持续累积；message_end 用最终 content 覆盖） */
  text: string;
  /** thinking 块全文 */
  thinking: string;
  /** 本 turn content 声明的 toolCall 列表（对应全局 tools 列表） */
  toolCallIds: string[];
  final: boolean;
}

export interface TurnBubble {
  id: string;
  /** 第几条 user 消息（0-based，fork 用）；-1 = 无 user 的孤儿气泡 */
  userIndex: number;
  userText: string;
  userFinal: boolean;
  turns: Turn[];
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
  bubbles: TurnBubble[];
  /** 最近气泡 id（assistant turn 追加目标） */
  currentBubbleId: string | null;
  /** 累计 user 消息数（流式 userIndex 续接） */
  userCount: number;
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
        userIndex?: number;
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
  | { type: "turn_start" }
  | { type: "turn_end" }
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
  | { type: "setWidget"; widgetKey: string; widgetLines: string[] | null };

export const initialState: StreamState = {
  bubbles: [],
  currentBubbleId: null,
  userCount: 0,
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
  return `b${seq}`;
}

export function textOfContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((b) => (b && typeof b === "object" && "text" in (b as object) ? ((b as { text: unknown }).text as string) : ""))
    .filter((s) => s.length > 0)
    .join("\n");
}

export function thinkingOfContent(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .map((b) =>
      b && typeof b === "object" && (b as { type?: unknown }).type === "thinking" && "thinking" in (b as object)
        ? String((b as { thinking: unknown }).thinking)
        : "",
    )
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

/** 气泡是否仍在更新（有未 final 的 turn） */
export function bubbleStreaming(bubble: TurnBubble): boolean {
  return bubble.turns.some((t) => !t.final);
}

/** 气泡内聚合（多 turn 拼接） */
export function bubbleThinking(bubble: TurnBubble): string {
  return bubble.turns.map((t) => t.thinking).filter((s) => s.length > 0).join("\n\n");
}

export function bubbleToolCallIds(bubble: TurnBubble): string[] {
  const out: string[] = [];
  for (const t of bubble.turns) for (const id of t.toolCallIds) if (!out.includes(id)) out.push(id);
  return out;
}

function updateBubble(state: StreamState, id: string, patch: Partial<TurnBubble>): StreamState {
  return { ...state, bubbles: state.bubbles.map((b) => (b.id === id ? { ...b, ...patch } : b)) };
}

/** 最近气泡；无则创建孤儿气泡（异常序列兜底） */
function currentBubble(state: StreamState): TurnBubble {
  const existing = state.bubbles.find((b) => b.id === state.currentBubbleId);
  if (existing) return existing;
  const b: TurnBubble = { id: nextId(), userIndex: -1, userText: "", userFinal: true, turns: [] };
  return b;
}

export function streamReducer(state: StreamState, action: StreamAction): StreamState {
  switch (action.type) {
    case "conn":
      return { ...state, conn: action.state };

    case "history": {
      const bubbles: TurnBubble[] = [];
      const tools: ToolRow[] = [];
      let userCount = 0;
      let current: TurnBubble | null = null;
      for (const m of action.messages) {
        const toolCalls = m.toolCalls ?? [];
        if (m.role === "user") {
          const b: TurnBubble = {
            id: nextId(),
            userIndex: m.userIndex ?? userCount,
            userText: m.text,
            userFinal: true,
            turns: [],
          };
          bubbles.push(b);
          current = b;
          userCount = Math.max(userCount, (m.userIndex ?? userCount) + 1);
        } else if (m.role === "assistant") {
          // 空消息（无 text 无 thinking 无工具）数据层筛掉（服务端已筛，这里防御）
          if (!m.text && !(m.thinking ?? "") && toolCalls.length === 0) continue;
          if (!current) {
            current = { id: nextId(), userIndex: -1, userText: "", userFinal: true, turns: [] };
            bubbles.push(current);
          }
          current.turns.push({
            text: m.text,
            thinking: m.thinking ?? "",
            toolCallIds: toolCalls.map((t) => t.id),
            final: true,
          });
        } else {
          continue;
        }
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
      return {
        ...state,
        bubbles,
        tools,
        currentBubbleId: bubbles.length > 0 ? bubbles[bubbles.length - 1].id : null,
        userCount,
      };
    }

    case "message_start": {
      const role = action.message.role ?? "unknown";
      // toolResult 消息事件忽略（tools 列表以 tool_execution_* 为准）
      if (role === "toolResult") return state;
      if (role === "user") {
        // 新 user 消息 → 新气泡（聚合边界）
        const b: TurnBubble = {
          id: nextId(),
          userIndex: state.userCount,
          userText: textOfContent(action.message.content),
          userFinal: false,
          turns: [],
        };
        return {
          ...state,
          bubbles: [...state.bubbles, b],
          currentBubbleId: b.id,
          userCount: state.userCount + 1,
        };
      }
      // assistant：追加新 turn 到最近气泡
      const bubble = currentBubble(state);
      const turn: Turn = {
        text: textOfContent(action.message.content),
        thinking: "",
        toolCallIds: toolCallIdsOf(action.message.content),
        final: false,
      };
      const withTurn: TurnBubble = { ...bubble, turns: [...bubble.turns, turn] };
      return {
        ...state,
        bubbles:
          state.bubbles.find((b) => b.id === bubble.id)
            ? state.bubbles.map((b) => (b.id === bubble.id ? withTurn : b))
            : [...state.bubbles, withTurn],
        currentBubbleId: bubble.id,
      };
    }

    case "message_update": {
      const evt = action.event ?? {};
      const bubble = state.bubbles.find((b) => b.id === state.currentBubbleId);
      if (!bubble) return state;
      const turn = bubble.turns[bubble.turns.length - 1];
      if (!turn || turn.final) return state;
      if (evt.type === "text_delta") {
        return updateBubble(state, bubble.id, {
          turns: [...bubble.turns.slice(0, -1), { ...turn, text: turn.text + (evt.delta ?? "") }],
        });
      }
      if (evt.type === "thinking_delta") {
        const partialThinking = evt.partial?.thinking;
        return updateBubble(state, bubble.id, {
          turns: [
            ...bubble.turns.slice(0, -1),
            { ...turn, thinking: partialThinking ?? turn.thinking + (evt.delta ?? "") },
          ],
        });
      }
      return state;
    }

    case "message_end": {
      const role = action.message.role ?? "unknown";
      if (role === "user") {
        // user 消息定稿（文本覆盖）
        const bubble = state.bubbles.find((b) => b.id === state.currentBubbleId);
        if (!bubble || !bubble.userFinal) {
          const target = state.bubbles.find((b) => b.id === state.currentBubbleId);
          if (!target) return state;
          return updateBubble(state, target.id, { userText: textOfContent(action.message.content), userFinal: true });
        }
        return state;
      }
      if (role !== "assistant") return state;
      const bubble = state.bubbles.find((b) => b.id === state.currentBubbleId);
      if (!bubble) return state;
      const turn = bubble.turns[bubble.turns.length - 1];
      if (!turn || turn.final) return state;
      const finalText = textOfContent(action.message.content);
      const thinking = thinkingOfContent(action.message.content);
      const ids = toolCallIdsOf(action.message.content);
      // 空 turn（无 text、无 thinking、无工具）→ 移除；turns 空且无 user 文本的孤儿气泡一并移除
      if (!finalText && !thinking && ids.length === 0) {
        const turns = bubble.turns.slice(0, -1);
        const keepBubble = turns.length > 0 || bubble.userText.length > 0 || bubble.userIndex >= 0;
        if (!keepBubble) {
          return {
            ...state,
            bubbles: state.bubbles.filter((b) => b.id !== bubble.id),
            currentBubbleId: state.currentBubbleId === bubble.id ? null : state.currentBubbleId,
          };
        }
        return updateBubble(state, bubble.id, { turns });
      }
      return updateBubble(state, bubble.id, {
        turns: [
          ...bubble.turns.slice(0, -1),
          {
            text: finalText || turn.text,
            thinking: thinking || turn.thinking,
            toolCallIds: ids.length > 0 ? ids : turn.toolCallIds,
            final: true,
          },
        ],
      });
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
        tools: existing
          ? state.tools.map((t) => (t.toolCallId === action.toolCallId ? { ...t, args: action.args } : t))
          : [...state.tools, row],
      };
    }

    case "tool_update": {
      const text = textOfContent(action.partialResult?.content);
      if (!text) return state;
      return {
        ...state,
        tools: state.tools.map((t) => (t.toolCallId === action.toolCallId ? { ...t, output: text } : t)),
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

    // turn 边界：turn_end 兜底 final 化活跃 turn（message_end 已处理则 no-op）
    case "turn_start":
      return state;

    case "turn_end": {
      const bubble = state.bubbles.find((b) => b.id === state.currentBubbleId);
      if (!bubble) return state;
      const turn = bubble.turns[bubble.turns.length - 1];
      if (!turn || turn.final) return state;
      return updateBubble(state, bubble.id, {
        turns: [...bubble.turns.slice(0, -1), { ...turn, final: true }],
      });
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
        // 会话切换 → 清空旧会话气泡与工具
        bubbles: [],
        tools: [],
        currentBubbleId: null,
        userCount: 0,
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

    default:
      return state;
  }
}
