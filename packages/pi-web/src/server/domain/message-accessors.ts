/**
 * 消息内容访问器（纯函数，领域层）：
 * - toolCall / text / thinking 块提取——历史会话渲染与上下文统计共用。
 */

export interface ToolCallBlock {
  id: string;
  name: string;
  arguments: unknown;
}

/** 从消息 content 提取 toolCall 块（id/name/arguments，顺序保持） */
export function messageToolCalls(content: unknown): ToolCallBlock[] {
  if (!Array.isArray(content)) return [];
  const out: ToolCallBlock[] = [];
  for (const b of content) {
    if (b && typeof b === "object" && (b as { type?: unknown }).type === "toolCall") {
      const id = (b as { id?: unknown }).id;
      if (id != null) {
        out.push({ id: String(id), name: String((b as { name?: unknown }).name ?? ""), arguments: (b as { arguments?: unknown }).arguments ?? null });
      }
    }
  }
  return out;
}

/** 从消息 content 提取文本（只取 text 块，过滤空块） */
export function messageTextOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((b) => (b && typeof b === "object" && "text" in (b as object) ? String((b as { text: unknown }).text) : ""))
    .filter((s) => s.length > 0)
    .join("\n");
}

/** 从消息 content 提取 thinking 块 */
export function messageThinkingOf(content: unknown): string {
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
