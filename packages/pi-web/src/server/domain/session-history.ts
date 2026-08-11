/**
 * 会话历史读取（纯函数，注入文件读取）：
 * - 任意 session 的 jsonl → HistoryMessage[]（多实例 chat tab 用）
 * - entries 解析逻辑从 rpc-handler getMessages 提取（单一来源）
 */

import { messageTextOf, messageThinkingOf, messageToolCalls } from "../infrastructure/http-util.js";

export interface SessionEntryLike {
  type?: string;
  message?: { role?: string; content?: unknown; toolCallId?: unknown; isError?: unknown } | null;
}

export interface HistoryMessage {
  role: string;
  text: string;
  thinking: string;
  toolCalls: { id: string; name: string; arguments: unknown; result: string; isError: boolean }[];
  userIndex?: number;
}

/** entries → 历史消息（toolResult 按 toolCallId 关联；空消息筛掉；user 带 userIndex） */
export function parseSessionEntries(entries: SessionEntryLike[]): HistoryMessage[] {
  const resultById = new Map<string, { result: string; isError: boolean }>();
  for (const e of entries) {
    const m = e?.message;
    if (e?.type !== "message" || !m || m.role !== "toolResult" || m.toolCallId == null) continue;
    resultById.set(String(m.toolCallId), { result: messageTextOf(m.content), isError: m.isError === true });
  }
  const messages: HistoryMessage[] = [];
  let userIndex = -1;
  for (const e of entries) {
    const m = e?.message;
    if (e?.type !== "message" || !m) continue;
    const role = m.role ?? "unknown";
    if (role === "toolResult") continue;
    if (role === "assistant") {
      const toolCalls = messageToolCalls(m.content).map((tc) => {
        const r = resultById.get(tc.id);
        return { ...tc, result: r?.result ?? "", isError: r?.isError ?? false };
      });
      const text = messageTextOf(m.content);
      const thinking = messageThinkingOf(m.content);
      if (!text && !thinking && toolCalls.length === 0) continue; // 空消息直接筛掉
      messages.push({ role, text, thinking, toolCalls });
    } else {
      userIndex += 1;
      messages.push({ role, text: messageTextOf(m.content), thinking: "", toolCalls: [], userIndex });
    }
  }
  return messages;
}

/** 解析 session jsonl 文件内容（每行一个 entry）；非法/空返回空数组 */
export function parseSessionJsonl(text: string): SessionEntryLike[] {
  const entries: SessionEntryLike[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    try {
      entries.push(JSON.parse(trimmed) as SessionEntryLike);
    } catch {
      /* 坏行跳过 */
    }
  }
  return entries;
}

/** 按文件读历史（注入 readFile——单测可传内存实现）；文件不可读返回 null */
export function readSessionHistory(
  filePath: string,
  readFile: (p: string) => string,
): HistoryMessage[] | null {
  let text: string | undefined;
  try {
    text = readFile(filePath);
  } catch {
    return null;
  }
  if (text === undefined) return null;
  return parseSessionEntries(parseSessionJsonl(text));
}
