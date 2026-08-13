/**
 * 工作区 tab 状态机（entities/workspace）：文件 tab + 聊天 tab 的纯状态迁移。
 * 聊天 tab 常驻（不可关闭）；文件 tab 打开去重、关闭激活相邻。
 */

export type WorkspaceTab =
  | { kind: "file"; path: string; name: string; dirty: boolean; preview: boolean }
  | { kind: "diff"; path: string; name: string; repoRoot?: string }
  | { kind: "chat"; sessionId: string; name: string; dead?: boolean };

export interface WorkspaceState {
  tabs: WorkspaceTab[];
  /** 激活 tab 标识：文件路径 或 "chat" */
  active: string;
}

/** chat tab 激活标识（会话维度：chat:<sessionId>；sessionId = 会话文件路径） */
export function chatTabId(sessionId: string): string {
  return `chat:${sessionId}`;
}

/** 从激活 id 解析 chat 的 sessionId；非 chat 返回 null */
export function chatSessionOf(active: string): string | null {
  return active.startsWith("chat:") ? active.slice("chat:".length) : null;
}

/** 初始：无 tab（主区空态——由会话/文件面板打开） */
export function initialState(): WorkspaceState {
  return { tabs: [], active: "" };
}

/** 打开/激活会话 chat tab（打开即激活；同会话去重） */
export function openChatTab(state: WorkspaceState, sessionId: string, name: string): WorkspaceState {
  const id = chatTabId(sessionId);
  if (state.tabs.some((t) => t.kind === "chat" && t.sessionId === sessionId)) {
    return { ...state, active: id };
  }
  return { tabs: [...state.tabs, { kind: "chat", sessionId, name }], active: id };
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
    t.kind === "file" ? t.path === id : t.kind === "diff" ? diffTabId(t.path) === id : t.kind === "chat" ? chatTabId(t.sessionId) === id : false,
  );
  if (!exists) return state;
  return { ...state, active: id };
}

/** 关闭 tab（文件/diff/chat）：激活右邻（无则左邻）；chat 与 file 同级均可关；不存在则状态不变 */
export function closeTab(state: WorkspaceState, id: string): WorkspaceState {
  const isDiff = id.startsWith("diff:");
  const isChat = id.startsWith("chat:");
  const match = (t: WorkspaceTab): boolean =>
    isDiff
      ? t.kind === "diff" && diffTabId(t.path) === id
      : isChat
        ? t.kind === "chat" && chatTabId(t.sessionId) === id
        : t.kind === "file" && t.path === id;
  const idx = state.tabs.findIndex(match);
  if (idx === -1) return state;
  const tabs = state.tabs.filter((t) => !match(t));
  let active = state.active;
  if (active === id) {
    const next = tabs[Math.min(idx, tabs.length - 1)];
    active = next ? (next.kind === "file" ? next.path : next.kind === "diff" ? diffTabId(next.path) : chatTabId(next.sessionId)) : "";
  }
  return { tabs, active };
}

/** 关闭 chat tab；不存在忽略 */
export function closeChatTab(state: WorkspaceState, sessionId: string): WorkspaceState {
  return closeTab(state, chatTabId(sessionId));
}

/** 更新 chat tab 显示名（session 名变化同步）；不存在忽略 */
export function renameChatTab(state: WorkspaceState, sessionId: string, name: string): WorkspaceState {
  if (!state.tabs.some((t) => t.kind === "chat" && t.sessionId === sessionId)) return state;
  return {
    ...state,
    tabs: state.tabs.map((t) => (t.kind === "chat" && t.sessionId === sessionId ? { ...t, name } : t)),
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

/** 注册者列表与当前 chat tab 的差值（agent_list 变化 → 开/关 tab 的纯决策） */
export interface AgentTabInfo {
  sessionFile: string | null;
  sessionName: string | null;
}

export function diffAgentTabs(
  state: WorkspaceState,
  agents: AgentTabInfo[],
): { join: { sessionFile: string; sessionName: string | null }[]; leave: string[] } {
  const chatTabs = state.tabs.filter((t): t is Extract<WorkspaceTab, { kind: "chat" }> => t.kind === "chat");
  const join: { sessionFile: string; sessionName: string | null }[] = [];
  const seen = new Set<string>();
  for (const a of agents) {
    if (!a.sessionFile || seen.has(a.sessionFile)) continue;
    seen.add(a.sessionFile);
    // 未开 / dead（断线待重建复活）→ join
    const existing = chatTabs.find((t) => t.sessionId === a.sessionFile);
    if (!existing || existing.dead === true) join.push({ sessionFile: a.sessionFile, sessionName: a.sessionName });
  }
  const leave = chatTabs.filter((t) => !seen.has(t.sessionId)).map((t) => t.sessionId);
  return { join, leave };
}

/** 打开会话的决策（会话管理点击）：已有 tab → activate；有实例无 tab → open；否则 spawn */
export function chatOpenAction(
  state: WorkspaceState,
  agents: { sessionFile: string | null }[],
  sessionId: string,
): { kind: "activate" } | { kind: "open"; name: string } | { kind: "spawn" } {
  const existing = state.tabs.find((t) => t.kind === "chat" && t.sessionId === sessionId) as
    | Extract<WorkspaceTab, { kind: "chat" }>
    | undefined;
  // dead（断线）tab：重新拉起 = 重新 spawn（join 后重建复活）
  if (existing) return existing.dead === true ? { kind: "spawn" } : { kind: "activate" };
  if (agents.some((a) => a.sessionFile === sessionId)) return { kind: "open", name: sessionId.split("/").pop() ?? "聊天" };
  return { kind: "spawn" };
}

/** 标记 chat tab 断线（agent 退出——实例崩溃/被杀）；不存在忽略 */
export function markChatDead(state: WorkspaceState, sessionId: string): WorkspaceState {
  if (!state.tabs.some((t) => t.kind === "chat" && t.sessionId === sessionId)) return state;
  return {
    ...state,
    tabs: state.tabs.map((t) => (t.kind === "chat" && t.sessionId === sessionId ? { ...t, dead: true } : t)),
  };
}

/** 会话消失时 tab 的处置：dead（断线保留待重拉）→ keep；正常 → close */
export function chatLeaveAction(tabs: WorkspaceTab[], sessionId: string): "keep" | "close" {
  const t = tabs.find((x) => x.kind === "chat" && x.sessionId === sessionId);
  if (!t || t.kind !== "chat") return "close";
  return t.dead === true ? "keep" : "close";
}

/** 拖拽调序：把 fromId 的 tab 移到 toId 的 tab 位置（激活不变）；任一不存在 → 状态不变 */
export function moveTab(state: WorkspaceState, fromId: string, toId: string): WorkspaceState {
  const idOf = (t: WorkspaceTab): string =>
    t.kind === "file" ? t.path : t.kind === "diff" ? diffTabId(t.path) : chatTabId(t.sessionId);
  const from = state.tabs.findIndex((t) => idOf(t) === fromId);
  const to = state.tabs.findIndex((t) => idOf(t) === toId);
  if (from === -1 || to === -1 || from === to) return state;
  const tabs = [...state.tabs];
  const [moved] = tabs.splice(from, 1);
  tabs.splice(to, 0, moved);
  return { ...state, tabs };
}

/** tab 元素边界（相对 tablist 左缘）——tab 栏拖拽插入位置解析的输入 */
export interface TabRect {
  left: number;
  width: number;
}

/** tab 栏按落点 x 解析插入序号（0..n，n = 末尾追加）：与各 tab 中点比较——左半（含中点）→ 该 tab 前；右半 → 其后 */
export function resolveInsertIndex(bounds: TabRect[], x: number): number {
  for (let i = 0; i < bounds.length; i++) {
    if (x <= bounds[i].left + bounds[i].width / 2) return i;
  }
  return bounds.length;
}
