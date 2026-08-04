/** 通知文案格式化与消息提取（纯函数，TDD：test/format.test.ts） */

import type { TerminalStatus } from "./ask.js";

export type NotifyKind = "result" | "ask";

const TITLES: Record<NotifyKind, string> = {
  result: "✅ pi",
  ask: "❓ pi 提问",
};

const pad2 = (n: number): string => String(n).padStart(2, "0");

/** 标题：`✅ pi · 09:05` / `❓ pi 提问 · 12:30` */
export function buildTitle(kind: NotifyKind, date: Date): string {
  const hhmm = `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  return `${TITLES[kind]} · ${hhmm}`;
}

/** 需求 1：内容 = 最终回复原文（透传，含多行） */
export function buildResultContent(text: string): string {
  return text;
}

/** 需求 2：问题 + 编号选项列表（无选项时仅问题） */
export function buildAskContent(question: string, options: readonly string[] = []): string {
  if (options.length === 0) return question;
  const lines = options.map((opt, i) => `${i + 1}) ${opt}`);
  return [question, ...lines].join("\n");
}

/** 终结状态文案（替换原通知，Direct Reply 通知无法 remove 时的反馈通道） */
export function buildStatusContent(status: TerminalStatus): string {
  return status === "answered" ? "已收到你的回复 ✓" : "⏰ 提问已超时，未收到回复";
}

/** 无可通知内容判定（空串/纯空白） */
export function hasContent(text: string): boolean {
  return text.trim().length > 0;
}

/** 从 agent run 消息里提取最后一条非空 assistant 文本（content 兼容 string / 文本块数组） */
export function extractAssistantText(messages: unknown): string | null {
  if (!Array.isArray(messages)) return null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i] as { role?: unknown; content?: unknown } | null;
    if (!m || m.role !== "assistant") continue;
    const text = textFromContent(m.content);
    if (text !== null && text.trim().length > 0) return text;
  }
  return null;
}

function textFromContent(content: unknown): string | null {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const c of content) {
      const block = c as { type?: unknown; text?: unknown } | null;
      if (block && block.type === "text" && typeof block.text === "string") {
        parts.push(block.text);
      }
    }
    if (parts.length > 0) return parts.join("\n");
  }
  return null;
}

/** 确认引导提示词（软引导）：LLM 不确定时优先用 notify 工具问用户，而非自作主张。
 *  纯指令、无示例（few-shot 会教条化）；英文与 pi system prompt 主体一致、紧凑省 token。
 *  由 before_agent_start 每 turn 追加到 system prompt（config.confirmPrompt=true 时）。 */
export function buildConfirmPrompt(): string {
  return (
    "Prefer asking via notify_ask_options (or notify_ask_input if options can't be enumerated) " +
    "over guessing. Ask when intent is ambiguous, the action is hard to reverse " +
    "(delete, overwrite, publish, spend), or information is missing. Do NOT ask when " +
    "the answer is already in context, the choice is trivial, or direction is clear."
  );
}
