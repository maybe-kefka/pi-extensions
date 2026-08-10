/**
 * 打开文件模型（entities/files）：Ticket 02 将扩展 dirty/保存状态。
 */

export type FileMode = "text" | "binary" | "too-large";

export interface OpenedFile {
  path: string;
  name: string;
  content: string;
  mode: FileMode;
  size: number;
  mtimeMs: number;
  hash: string;
}

/** 可编辑判定：text 模式且未超过大文件阈值 */
export function isEditable(mode: FileMode): boolean {
  return mode === "text";
}
