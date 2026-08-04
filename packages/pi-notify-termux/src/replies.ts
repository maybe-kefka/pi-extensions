/** 文件桥编解码（纯函数，TDD：test/replies.test.ts）。
 *  通知 action（helper.sh）写入 replies/ 目录，扩展轮询解析。
 *  文件格式：`<kind>-<id>.reply`（回复） / `ask-<id>.cancel`（滑掉取消）。 */

import { hasContent } from "./format.js";

export type ReplyKind = "notify" | "ask";

export const NOTIFY_PREFIX = "notify-";
export const ASK_PREFIX = "ask-";

export interface ReplyFileInfo {
  kind: ReplyKind;
  id: string;
  type: "reply" | "cancel";
}

const ID_RE = /^[A-Za-z0-9_-]+$/;

/** 解析文件名 → 结构化信息；非法名（含路径穿越/分隔符/缺 id）→ null */
export function parseFileName(name: string): ReplyFileInfo | null {
  const m = /^(notify|ask)-([^./\\]+)\.(reply|cancel)$/.exec(name);
  if (!m) return null;
  const [, kind, id, type] = m;
  if (!ID_RE.test(id)) return null;
  return { kind: kind as ReplyKind, id, type: type as "reply" | "cancel" };
}

/**
 * Direct Reply 原文 → 回复体。
 * 空输入（空串/纯空白，含"直接发送空回复"）→ null（= 取消，SPEC §4.1）。
 */
export function decodeReply(text: string): { text: string } | null {
  if (!hasContent(text)) return null;
  return { text };
}

/** 选项回复映射：纯数字且落在选项范围内 → 选中项；否则 null（自由输入） */
export function parseOptionSelection(
  text: string,
  options: readonly string[],
): { selection: number; option: string; text: string } | null {
  if (options.length === 0) return null;
  if (!/^\d+$/.test(text.trim())) return null;
  const n = Number(text.trim());
  const option = options[n - 1];
  if (option === undefined) return null;
  return { selection: n, option, text: option };
}
