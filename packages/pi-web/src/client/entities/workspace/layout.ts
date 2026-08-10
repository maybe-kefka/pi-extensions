/**
 * 工作区布局持久化（entities/workspace）：侧边栏宽度（localStorage，与 theme 偏好同机制）。
 */

const KEY = "pi:panel-width";
export const PANEL_MIN = 200;
export const PANEL_MAX = 480;
export const PANEL_DEFAULT = 260;

export function clampPanelWidth(width: number): number {
  return Math.min(PANEL_MAX, Math.max(PANEL_MIN, Math.round(width)));
}

export function loadPanelWidth(storage: Storage): number {
  const raw = storage.getItem(KEY);
  if (raw === null) return PANEL_DEFAULT;
  const n = Number(raw);
  if (!Number.isFinite(n)) return PANEL_DEFAULT;
  return clampPanelWidth(n);
}

export function savePanelWidth(storage: Storage, width: number): void {
  storage.setItem(KEY, String(clampPanelWidth(width)));
}
