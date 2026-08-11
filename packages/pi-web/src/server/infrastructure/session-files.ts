/**
 * 删除会话：路径校验 + unlink（非官方 API，SPEC §4.4 `pi:deleteSession`）。
 * 校验为纯函数（TDD）；unlink 薄封装。
 */

import { unlink } from "node:fs/promises";
import { validateDeletableSession, type ValidationResult } from "../domain/session-file-rules.js";

/**
 * 校验待删除会话文件：
 * - 非空、绝对路径
 * - 扩展名 .jsonl
 * - 归一化后位于 sessionDir 内（防路径穿越）
 * - 非当前会话
 */
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
