/**
 * 编辑器保存状态机（entities/files）：防抖保存的纯状态迁移。
 * savedHash/savedMtimeMs 是最近一次保存成功的磁盘快照（下次保存的 expected）。
 */

import type { OpenedFile } from "./editor.js";

export interface ConflictInfo {
  current: { hash: string; mtimeMs: number };
}

export interface EditState {
  content: string;
  /** 内容相对最近保存快照有改动 */
  dirty: boolean;
  saving: boolean;
  conflict: ConflictInfo | null;
  /** 最近保存成功时的磁盘内容（dirty 判定基准） */
  savedContent: string;
  /** 最近保存成功时的磁盘快照（下次保存的 expected） */
  savedHash: string;
  savedMtimeMs: number;
}

export function initialEditState(file: OpenedFile): EditState {
  return {
    content: file.content,
    dirty: false,
    saving: false,
    conflict: null,
    savedContent: file.content,
    savedHash: file.hash,
    savedMtimeMs: file.mtimeMs,
  };
}

/** 用户编辑：内容更新；与已保存内容不同 → dirty */
export function editContent(state: EditState, content: string): EditState {
  return { ...state, content, dirty: content !== state.savedContent };
}

export function markSaving(state: EditState): EditState {
  return { ...state, saving: true };
}

export function markSaved(state: EditState, next: { hash: string; mtimeMs: number }): EditState {
  return {
    ...state,
    dirty: false,
    saving: false,
    conflict: null,
    savedContent: state.content,
    savedHash: next.hash,
    savedMtimeMs: next.mtimeMs,
  };
}

export function markConflict(state: EditState, current: { hash: string; mtimeMs: number }): EditState {
  return { ...state, saving: false, conflict: { current } };
}

/** 覆盖：用磁盘当前快照作为 expected 重试保存（保留编辑内容） */
export function resolveConflictOverwrite(state: EditState): EditState {
  const current = state.conflict?.current;
  if (!current) return state;
  return { ...state, savedHash: current.hash, savedMtimeMs: current.mtimeMs, conflict: null };
}

/** 放弃/重新加载：恢复磁盘内容（丢弃编辑） */
export function reloadFromDisk(state: EditState, file: OpenedFile): EditState {
  return {
    content: file.content,
    dirty: false,
    saving: false,
    conflict: null,
    savedContent: file.content,
    savedHash: file.hash,
    savedMtimeMs: file.mtimeMs,
  };
}

/** dirty 判定（供 UI 显示脏标记） */
export function isDirty(state: EditState): boolean {
  return state.dirty;
}
