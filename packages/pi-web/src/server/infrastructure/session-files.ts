/**
 * 删除会话：路径校验 + unlink（非官方 API，SPEC §4.4 `pi:deleteSession`）。
 * 校验为纯函数（TDD）；unlink 薄封装。
 */

import { unlink } from "node:fs/promises";
import { extname, isAbsolute, normalize, resolve, sep } from "node:path";

export interface ValidationResult {
  ok: boolean;
  error?: string;
}

/**
 * 校验待删除会话文件：
 * - 非空、绝对路径
 * - 扩展名 .jsonl
 * - 归一化后位于 sessionDir 内（防路径穿越）
 * - 非当前会话
 */
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

/** 校验通过则 unlink；任何失败返回错误（不 throw）。 */
export async function deleteSessionFile(
  sessionDir: string,
  path: string,
  currentSessionFile: string | null,
): Promise<ValidationResult> {
  const v = validateDeletableSession(sessionDir, path, currentSessionFile);
  if (!v.ok) return v;
  try {
    await unlink(path);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `删除失败: ${err instanceof Error ? err.message : String(err)}` };
  }
}
