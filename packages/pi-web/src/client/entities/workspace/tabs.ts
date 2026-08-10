/**
 * 工作区 tab 状态机（entities/workspace）：文件 tab + 聊天 tab 的纯状态迁移。
 * 聊天 tab 常驻（不可关闭）；文件 tab 打开去重、关闭激活相邻。
 */

export type WorkspaceTab =
  | { kind: "file"; path: string; name: string; dirty: boolean }
  | { kind: "chat" };

export interface WorkspaceState {
  tabs: WorkspaceTab[];
  /** 激活 tab 标识：文件路径 或 "chat" */
  active: string;
}

export const CHAT_TAB_ID = "chat";
/** 文件浏览态（无文件 tab 时的树+空编辑器视图，非真实 tab） */
export const FILES_VIEW_ID = "files";

export function chatTab(): string {
  return CHAT_TAB_ID;
}

export function initialState(): WorkspaceState {
  return { tabs: [{ kind: "chat" }], active: CHAT_TAB_ID };
}

/** 打开文件：已打开仅激活；否则追加并激活 */
export function openFile(state: WorkspaceState, path: string, name: string): WorkspaceState {
  if (state.tabs.some((t) => t.kind === "file" && t.path === path)) {
    return { ...state, active: path };
  }
  return { tabs: [...state.tabs, { kind: "file", path, name, dirty: false }], active: path };
}

/** 激活任意 tab（chat / 文件路径 / 文件浏览态） */
export function activateTab(state: WorkspaceState, id: string): WorkspaceState {
  const exists = state.tabs.some((t) => (t.kind === "file" ? t.path === id : id === CHAT_TAB_ID));
  if (!exists && id !== FILES_VIEW_ID) return state;
  return { ...state, active: id };
}

/** 关闭文件 tab：激活右邻（无则左邻）；聊天 tab 不可关闭；不存在则状态不变 */
export function closeTab(state: WorkspaceState, id: string): WorkspaceState {
  if (id === CHAT_TAB_ID) return state;
  const idx = state.tabs.findIndex((t) => t.kind === "file" && t.path === id);
  if (idx === -1) return state;
  const tabs = state.tabs.filter((t) => !(t.kind === "file" && t.path === id));
  let active = state.active;
  if (active === id) {
    const next = tabs[Math.min(idx, tabs.length - 1)];
    active = next ? (next.kind === "file" ? next.path : CHAT_TAB_ID) : CHAT_TAB_ID;
  }
  return { tabs, active };
}

/** 标记文件 tab dirty 状态（编辑器编辑/保存后上报）；不存在路径忽略 */
export function setDirty(state: WorkspaceState, path: string, dirty: boolean): WorkspaceState {
  const t = state.tabs.find((x) => x.kind === "file" && x.path === path);
  if (!t || t.kind !== "file" || t.dirty === dirty) return state;
  return {
    ...state,
    tabs: state.tabs.map((x) => (x.kind === "file" && x.path === path ? { ...x, dirty } : x)),
  };
}

/** 文件 tab 的 dirty 状态（不存在/非文件返回 false） */
export function tabDirty(state: WorkspaceState, path: string): boolean {
  const t = state.tabs.find((x) => x.kind === "file" && x.path === path);
  return t?.kind === "file" ? t.dirty : false;
}

/** 是否存在 dirty 文件 tab（关闭确认/保存按钮用） */
export function hasDirty(state: WorkspaceState): boolean {
  return state.tabs.some((t) => t.kind === "file" && t.dirty);
}
