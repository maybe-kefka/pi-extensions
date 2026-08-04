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
