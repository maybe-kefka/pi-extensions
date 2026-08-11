/**
 * 工作区 tab 状态机（entities/workspace）：文件 tab + 聊天 tab 的纯状态迁移。
 * 聊天 tab 常驻（不可关闭）；文件 tab 打开去重、关闭激活相邻。
 */

export type WorkspaceTab =
  | { kind: "file"; path: string; name: string; dirty: boolean; preview: boolean }
  | { kind: "diff"; path: string; name: string; repoRoot?: string }
  | { kind: "chat"; processId: string; name: string };

export interface WorkspaceState {
  tabs: WorkspaceTab[];
  /** 激活 tab 标识：文件路径 或 "chat" */
  active: string;
}

/** 宿主进程 processId（默认 tab） */
export const HOST_PROCESS_ID = "host";

/** chat tab 激活标识（processId 维度：chat:<processId>） */
export function chatTabId(processId: string): string {
  return `chat:${processId}`;
}

/** 从激活 id 解析 chat 的 processId；非 chat 返回 null */
export function chatProcessOf(active: string): string | null {
  return active.startsWith("chat:") ? active.slice("chat:".length) : null;
}

/** 文件浏览态（无文件 tab 时的树+空编辑器视图，非真实 tab） */
export const FILES_VIEW_ID = "files";

export function initialState(processId = HOST_PROCESS_ID, name = "聊天"): WorkspaceState {
  return { tabs: [{ kind: "chat", processId, name }], active: chatTabId(processId) };
}

/** 打开/激活 chat tab（多实例：每进程一 tab） */
export function openChatTab(state: WorkspaceState, processId: string, name: string): WorkspaceState {
  const id = chatTabId(processId);
  if (state.tabs.some((t) => t.kind === "chat" && t.processId === processId)) {
    return { ...state, active: id };
  }
  return { tabs: [...state.tabs, { kind: "chat", processId, name }], active: id };
}

export interface OpenFileOptions {
  /** 预览模式：已有预览 tab 时先关闭（全局唯一）；已打开的 preview 文件 → promote */
  preview?: boolean;
}

/** 打开文件：已打开仅激活（preview 请求且已打开 → promote）；否则追加并激活 */
export function openFile(state: WorkspaceState, path: string, name: string, opts: OpenFileOptions = {}): WorkspaceState {
  const existing = state.tabs.find((t) => t.kind === "file" && t.path === path);
  if (existing) {
    const next =
      existing.kind === "file" && !opts.preview && existing.preview
        ? { ...existing, preview: false }
        : existing;
    return {
      ...state,
      tabs: state.tabs.map((t) => (t.kind === "file" && t.path === path ? next : t)),
      active: path,
    };
  }
  if (opts.preview) {
    // 预览模式：关闭已有预览 tab（全局唯一）
    const tabs = state.tabs.filter((t) => !(t.kind === "file" && t.preview));
    return { tabs: [...tabs, { kind: "file", path, name, dirty: false, preview: true }], active: path };
  }
  return { tabs: [...state.tabs, { kind: "file", path, name, dirty: false, preview: false }], active: path };
}

/** 预览 → 正式（preview 置 false）；不存在/非 preview 忽略 */
export function promotePreview(state: WorkspaceState, path: string): WorkspaceState {
  const t = state.tabs.find((x) => x.kind === "file" && x.path === path);
  if (!t || t.kind !== "file" || !t.preview) return state;
  return { ...state, tabs: state.tabs.map((x) => (x.kind === "file" && x.path === path ? { ...x, preview: false } : x)) };
}

/** 激活任意 tab（chat:<processId> / 文件路径 / diff:<path> / 文件浏览态） */
export function activateTab(state: WorkspaceState, id: string): WorkspaceState {
  const exists = state.tabs.some((t) =>
    t.kind === "file" ? t.path === id : t.kind === "diff" ? diffTabId(t.path) === id : t.kind === "chat" ? chatTabId(t.processId) === id : false,
  );
  if (!exists && id !== FILES_VIEW_ID) return state;
  return { ...state, active: id };
}

/** 关闭 tab（文件/diff/chat）：激活右邻（无则左邻）；宿主 chat tab 不可关；不存在则状态不变 */
export function closeTab(state: WorkspaceState, id: string): WorkspaceState {
  if (id === chatTabId(HOST_PROCESS_ID)) return state;
  const isDiff = id.startsWith("diff:");
  const isChat = id.startsWith("chat:");
  const match = (t: WorkspaceTab): boolean =>
    isDiff
      ? t.kind === "diff" && diffTabId(t.path) === id
      : isChat
        ? t.kind === "chat" && chatTabId(t.processId) === id
        : t.kind === "file" && t.path === id;
  const idx = state.tabs.findIndex(match);
  if (idx === -1) return state;
  const tabs = state.tabs.filter((t) => !match(t));
  let active = state.active;
  if (active === id) {
    const next = tabs[Math.min(idx, tabs.length - 1)];
    active = next ? (next.kind === "file" ? next.path : next.kind === "diff" ? diffTabId(next.path) : chatTabId(next.processId)) : chatTabId(HOST_PROCESS_ID);
  }
  return { tabs, active };
}

/** 关闭 chat tab（host 不可关）；不存在忽略 */
export function closeChatTab(state: WorkspaceState, processId: string): WorkspaceState {
  return closeTab(state, chatTabId(processId));
}

/** 更新 chat tab 显示名（session 名变化同步）；不存在忽略 */
export function renameChatTab(state: WorkspaceState, processId: string, name: string): WorkspaceState {
  if (!state.tabs.some((t) => t.kind === "chat" && t.processId === processId)) return state;
  return {
    ...state,
    tabs: state.tabs.map((t) => (t.kind === "chat" && t.processId === processId ? { ...t, name } : t)),
  };
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

/** 打开 diff tab（与编辑器 tab 可共存；去重激活） */
export function openDiffTab(state: WorkspaceState, path: string, name: string, repoRoot?: string): WorkspaceState {
  if (state.tabs.some((t) => t.kind === "diff" && t.path === path)) {
    return { ...state, active: diffTabId(path) };
  }
  return { tabs: [...state.tabs, { kind: "diff", path, name, repoRoot }], active: diffTabId(path) };
}

/** diff tab 激活标识（与文件 tab 同 path 时区分——active 用 path 会冲突！） */
export function diffTabId(path: string): string {
  return `diff:${path}`;
}

/** 激活 diff tab（active 用带前缀 id；渲染时按 kind 匹配） */
export function activateDiffTab(state: WorkspaceState, path: string): WorkspaceState {
  return { ...state, active: diffTabId(path) };
}

/** 从激活 id 解析 diff 路径 */
export function diffPathOf(active: string): string | null {
  return active.startsWith("diff:") ? active.slice(5) : null;
}
