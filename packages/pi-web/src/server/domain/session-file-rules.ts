/**
 * 会话文件删除规则（领域层纯函数）：
 * - 路径合法性校验（绝对路径 / .jsonl / 会话目录内）——路径穿越防护属领域安全规则。
 */

import { extname, isAbsolute, normalize, resolve, sep } from "node:path";

export interface ValidationResult {
  ok: boolean;
  error?: string;
}

/** 删除前置校验：类型/范围/当前会话保护（纯函数，无 fs 操作） */
export function validateDeletableSession(
  sessionDir: string,
  path: string,
  currentSessionFile: string | null,
): ValidationResult {
  if (typeof path !== "string" || path.trim() === "") {
    return { ok: false, error: "会话路径不能为空" };
  }
  if (!isAbsolute(path)) {
    return { ok: false, error: "会话路径必须是绝对路径" };
  }
  if (extname(path).toLowerCase() !== ".jsonl") {
    return { ok: false, error: "只支持删除 .jsonl 会话文件" };
  }
  const normalized = normalize(path);
  const dir = normalize(resolve(sessionDir));
  if (normalized !== dir && !normalized.startsWith(dir + sep)) {
    return { ok: false, error: "会话路径不在会话目录内" };
  }
  if (currentSessionFile && normalize(resolve(currentSessionFile)) === normalized) {
    return { ok: false, error: "不能删除当前会话" };
  }
  return { ok: true };
}
