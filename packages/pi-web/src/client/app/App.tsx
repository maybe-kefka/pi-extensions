import { memo, startTransition, useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { createRpcClient, type RpcClient } from "@/shared/api";
import { initialState, metaEquals, pickStreamMeta, type StreamAction, type StreamState, type StreamStateMeta } from "@/entities/chat";
import type { AgentInfo } from "@/entities/chat";
import { isTransitionalAction, toAction } from "@/entities/chat";
import type { CommandInfo, FileGroup, HistoryMessage, ModelInfo, PiEvent, SessionInfo, SkillInfo, TreeNode, WebState } from "@/entities/chat";
import { ChatTab } from "@/pages/chat";
import { ChatEmptyGuide } from "@/features/chat-stream";
import { FilesTree } from "@/features/files";
import { EditorPane } from "@/features/files";
import { DiffSplitView } from "@/features/files";
import { TabsBar } from "@/features/editor-tabs";
import { Button } from "@/shared/ui";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/shared/ui";
import {
  activateTab,
  chatSessionOf,
  chatTabId,
  closeChatTab,
  closeTab,
  diffPathOf,
  initialTree as initialWorkspace,
  openChatTab,
  chatLeaveAction,
  chatOpenAction,
  diffAgentTabs,
  markChatDead,
  reviveChatTab,
  moveTab,
  openDiffTab,
  openFile,
  renameChatTab,
  promotePreview,
  setDirty,
  tabDirty,
  type WorkspaceState,
} from "@/entities/workspace";
import {
  findGroupOfTree,
  findLeaf,
  flattenTabs,
  mapLeaf,
  moveTabToGroup,
  removeEmptyLeaf,
  removeTabFromTree,
  serializeTree,
  deserializeTree,
  SPLIT_TREE_STORAGE_KEY,
  setSplitRatio,
  singleLeafOf,
  splitGroup,
  type LayoutNode,
  type LeafNode,
  type SplitSide,
} from "@/entities/workspace";
import type { EditorPaneHandle, EditorSnapshot } from "@/features/files";
import { clampPanelWidth, loadPanelWidth, savePanelWidth } from "@/entities/workspace";
import { ActivityBar, type ActivityPanel } from "@/features/activity-bar";
import { SplitView } from "@/features/workspace";
import { SessionPanel } from "@/features/sessions";
import { SettingsPanel } from "@/features/settings";
import { GitPanel } from "@/features/git-panel";
import { InputBar } from "@/features/input-bar";
import { DisconnectBanner } from "@/app/ui/DisconnectBanner";
import { TreeDialog } from "@/features/sessions";
import { Toaster } from "@/shared/ui";
import { applyTheme, watchSystemScheme } from "@/app/apply-theme";
import {
  loadPreference,
  parseSystemScheme,
  resolveTheme,
  savePreference,
  type Scheme,
  type ThemePreference,
} from "@/entities/theme";


const InputBarMemo = memo(InputBar);
const DisconnectBannerMemo = memo(DisconnectBanner);

/** 特权能力失效判定（后端 code 1 + 会话控制文案） */
function isPrivilegedError(e: Error): boolean {
  return e.message.includes("会话控制能力");
}

/** session 文件路径 → 显示名（未命名会话用创建时间） */
function sessionLabelFromFile(sf: string): string {
  const base = sf.split("/").pop() ?? "";
  // 2026-08-11T05-12-34-567Z_hash.jsonl → 08-11 05:12
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})/.exec(base);
  return m ? `${m[2]}-${m[3]} ${m[4]}:${m[5]}` : base;
}

export default function App() {
  const [hostState, setHostState] = useState<StreamStateMeta>({
    sessionFile: null, sessionName: null, model: null, thinkingLevel: null, availableThinkingLevels: [], bridge: { status: {}, widget: null, notifies: [] },
  });
  const [conn, setConn] = useState(initialState.conn);
  /** 激活 chat tab 状态上报（会话元数据——完整 stream state 高频变化不得上抛） */
  const handleTabStateChange = useCallback((sessionId: string, meta: StreamStateMeta) => {
    if (sessionId !== chatSessionOf(workspaceRef.current.active)) return;
    // 元数据无变化 → 返回 prev（React bail out，跳过重渲染——流式 delta 期间 App 不重跑）
    setHostState((prev) => (metaEquals(prev, meta) ? prev : { ...prev, ...meta }));
  }, []);

  /** 进程分发表：ChatTab 挂载时注册 dispatch（事件按 processId 路由） */
  const dispatchersRef = useRef<Record<string, (a: StreamAction) => void>>({});
  const registerDispatch = useCallback((processId: string, d: (a: StreamAction) => void) => {
    dispatchersRef.current[processId] = d;
  }, []);
  const unregisterDispatch = useCallback((processId: string) => {
    delete dispatchersRef.current[processId];
  }, []);
  const dispatchToProcess = useCallback((processId: string, action: StreamAction) => {
    // 分发表 key = 会话（sessionFile）——processId → sessionFile 查表路由
    const entry = agentsRef.current.find((ag) => ag.processId === processId);
    const sid = entry?.sessionFile;
    if (sid) dispatchersRef.current[sid]?.(action);
  }, []);
  /** 分发到激活 chat tab（进程当前会话 = 激活 tab——流式/conn 事件走这里） */
  const dispatchToActiveChat = useCallback((action: StreamAction) => {
    const sid = chatSessionOf(workspaceRef.current.active);
    if (sid) dispatchersRef.current[sid]?.(action);
  }, []);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  /** 注册进程表（agent_list 驱动 chat tab 生命周期） */
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  /** 各会话实例的 context usage（usage_update 上行——meter 数据） */
  const [usageBySession, setUsageBySession] = useState<Record<string, { percent: number | null; tokens: number | null; contextWindow: number | null }>>({});
  /** agents 最新引用（事件回调闭包读取——避免 stale） */
  const agentsRef = useRef<AgentInfo[]>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [commands, setCommands] = useState<CommandInfo[]>([]);
  const [files, setFiles] = useState<FileGroup[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [treeOpen, setTreeOpen] = useState(false);
  const [tree, setTree] = useState<TreeNode[] | null>(null);
  const [leafId, setLeafId] = useState<string | null>(null);
  const [treeLoading, setTreeLoading] = useState(false);
  const [degraded, setDegraded] = useState(false);
  const rpcRef = useRef<RpcClient | null>(null);
  const [booted, setBooted] = useState(false);
  // vscode-align 03：activity bar 面板（null = 收起）
  const [panel, setPanel] = useState<ActivityPanel | null>(null);
  // 关闭 dirty tab 确认（vscode-align 02：三选）
  const [pendingClose, setPendingClose] = useState<{ groupId: string; id: string } | null>(null);
  const [pendingSaving, setPendingSaving] = useState(false);
  // 保存成功 → 递增（文件面板 git 状态联动刷新）
  const [gitRefreshKey, setGitRefreshKey] = useState(0);
  // 侧边栏宽度（拖拽调整 + localStorage 持久化）
  const [panelWidth, setPanelWidth] = useState(() => loadPanelWidth(window.localStorage));
  const dragState = useRef<{ startX: number; startWidth: number } | null>(null);

  const onResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragState.current = { startX: e.clientX, startWidth: panelWidth };
    const onMove = (ev: MouseEvent) => {
      if (!dragState.current) return;
      setPanelWidth(clampPanelWidth(dragState.current.startWidth + ev.clientX - dragState.current.startX));
    };
    const onUp = () => {
      dragState.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      setPanelWidth((w) => {
        savePanelWidth(window.localStorage, w);
        return w;
      });
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [panelWidth]);
  const editorRefs = useRef<Record<string, EditorPaneHandle | null>>({});
  // R28：编辑器快照（重挂恢复——split/移动文件 tab 后内容/光标/滚动零损失；持续上报防隔代）
  const editorStatesRef = useRef<Record<string, EditorSnapshot>>({});
  const handleEditorStateSave = useCallback((path: string, snapshot: EditorSnapshot) => {
    editorStatesRef.current[path] = snapshot;
  }, []);
  // 02：拖拽分区——拖拽中的 tab（TabsBar dragstart 上报）
  const [dragTabId, setDragTabId] = useState<string | null>(null);
  // chat input 草稿（ref 存储——split 重挂后恢复；ref 写入不触发渲染，打字不卡顿）
  const chatDraftsRef = useRef<Record<string, string>>({});
  // chat reducer 状态快照（跨父重挂恢复——卸载时由 ChatTab 上报）
  const chatStatesRef = useRef<Record<string, StreamState>>({});
  const handleStateSave = useCallback((sessionId: string, state: StreamState) => {
    chatStatesRef.current[sessionId] = state;
  }, []);
  // R27：滚动位置（split 跨父重挂恢复——scrollTop 比例 0-1，滚动事件即时上报）
  const chatScrollAnchorsRef = useRef<Record<string, number | null>>({});
  const handleScrollAnchorSave = useCallback((sessionId: string, anchor: number | null) => {
    chatScrollAnchorsRef.current[sessionId] = anchor;
  }, []);
  const handleDraftChange = useCallback((sessionId: string, text: string) => {
    chatDraftsRef.current[sessionId] = text;
  }, []);
  // 04：聚焦区（最后交互的组）——外部打开/新注册会话的落点；从未交互 → 第一组
  const [focusGroupId, setFocusGroupId] = useState<string | null>(null);
  // file tab 首帧延迟挂载（恢复的初始渲染挂 EditorPane 触发 #185 渲染循环——下帧挂载与手动路径一致）
  const [fileDeferred, setFileDeferred] = useState(false);
  useEffect(() => {
    setFileDeferred(true);
  }, []);
  // vscode-align：工作区 tab 状态（文件 tab + 聊天 tab）
  const [workspaceTree, dispatchWs] = useReducer(
    (
      s: LayoutNode,
      a:
        | { kind: "open"; groupId: string; path: string; name: string; preview?: boolean }
        | { kind: "open-diff"; groupId: string; path: string; name: string; repoRoot?: string }
        | { kind: "activate"; groupId: string; id: string }
        | { kind: "close"; groupId: string; id: string }
        | { kind: "dirty"; groupId: string; path: string; dirty: boolean }
        | { kind: "promote"; groupId: string; path: string }
        | { kind: "rename-chat"; groupId: string; sessionId: string; name: string }
        | { kind: "open-chat"; groupId: string; sessionId: string; name: string }
        | { kind: "close-chat"; sessionId: string }
        | { kind: "dead-chat"; groupId: string; sessionId: string }
        | { kind: "revive-chat"; sessionId: string }
        | { kind: "move"; groupId: string; fromId: string; toId: string | null }
        | { kind: "split"; groupId: string; side: SplitSide; tabId: string }
        | { kind: "set-ratio"; splitId: string; ratio: number },
    ): LayoutNode => {
      switch (a.kind) {
        case "open":
          return mapLeaf(s, a.groupId, (leaf) => openFile(leaf, a.path, a.name, { preview: a.preview }));
        case "open-diff":
          return mapLeaf(s, a.groupId, (leaf) => openDiffTab(leaf, a.path, a.name, a.repoRoot));
        case "activate":
          return mapLeaf(s, a.groupId, (leaf) => activateTab(leaf, a.id));
        case "close":
          return removeEmptyLeaf(mapLeaf(s, a.groupId, (leaf) => closeTab(leaf, a.id)));
        case "dirty":
          return mapLeaf(s, a.groupId, (leaf) => setDirty(leaf, a.path, a.dirty));
        case "promote":
          return mapLeaf(s, a.groupId, (leaf) => promotePreview(leaf, a.path));
        case "rename-chat":
          return mapLeaf(s, a.groupId, (leaf) => renameChatTab(leaf, a.sessionId, a.name));
        case "open-chat":
          return mapLeaf(s, a.groupId, (leaf) => openChatTab(leaf, a.sessionId, a.name));
        case "close-chat":
          return removeTabFromTree(s, chatTabId(a.sessionId));
        case "dead-chat":
          return mapLeaf(s, a.groupId, (leaf) => markChatDead(leaf, a.sessionId));
        case "revive-chat":
          // R27：原地复活（清 dead 标记）——不 close/open（close 会触发空组合并，原组消失后无法回开）
          return mapLeaf(s, findGroupOfTree(s, chatTabId(a.sessionId)) ?? singleLeafOf(s).groupId, (leaf) =>
            reviveChatTab(leaf, a.sessionId),
          );
        case "move":
          return moveTabToGroup(s, a.groupId, a.fromId, a.toId);
        case "split":
          return splitGroup(s, a.groupId, a.side, a.tabId);
        case "set-ratio":
          return setSplitRatio(s, a.splitId, a.ratio);
      }
    },
    undefined,
    () => {
      // 06：恢复分区布局（localStorage）；损坏/旧格式兜底初始树
      try {
        return deserializeTree(localStorage.getItem(SPLIT_TREE_STORAGE_KEY) ?? "");
      } catch {
        return initialWorkspace();
      }
    },
  );
  // 01：单组等价——渲染侧仍读叶子内容（分区后按组渲染）
  const workspace = singleLeafOf(workspaceTree);
  // 06：分区布局持久化（树变化即存）
  useEffect(() => {
    try {
      localStorage.setItem(SPLIT_TREE_STORAGE_KEY, serializeTree(workspaceTree));
    } catch {
      /* 存储不可用（隐私模式等）——忽略 */
    }
  }, [workspaceTree]);

  // 06：恢复的 chat tab 无注册 agent → 标 dead（可复活）；agent_list 到达后由 join 复活
  useEffect(() => {
    if (agents.length > 0) return;
    for (const tab of flattenTabs(workspaceTree)) {
      if (tab.kind === "chat" && !tab.dead) {
        dispatchWs({
          kind: "dead-chat",
          groupId: findGroupOfTree(workspaceTree, chatTabId(tab.sessionId)) ?? focusRef.current,
          sessionId: tab.sessionId,
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agents]);

  // 04：聚焦组/聚焦 leaf（外部打开落点；focusGroupId 失效时回退第一组）
  const focusGroup = focusGroupId && findLeaf(workspaceTree, focusGroupId) ? focusGroupId : singleLeafOf(workspaceTree).groupId;
  const focusLeaf = findLeaf(workspaceTree, focusGroup) ?? singleLeafOf(workspaceTree);
  // workspace 最新引用（事件回调闭包读取）
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;
  // R27：完整 split 树最新引用（事件回调需全树查找——workspaceRef 只是单 leaf 扁平视图，
  // split 后其他组的 tab 不在其中，误用会重复 open/错误路由）
  const workspaceTreeRef = useRef(workspaceTree);
  workspaceTreeRef.current = workspaceTree;
  const focusRef = useRef(focusGroup);
  focusRef.current = focusGroup;

  // host 会话名变化 → 激活 chat tab 标题同步（若有）
  useEffect(() => {
    const sid = chatSessionOf(focusLeaf.active);
    if (hostState.sessionName && sid) dispatchWs({ kind: "rename-chat", groupId: focusRef.current, sessionId: sid, name: hostState.sessionName });
  }, [hostState.sessionName, focusLeaf.active]);

  // 激活 chat tab：会话不同 → 切换进程会话（历史由 ChatTab 首次加载；切回不重拉）
  useEffect(() => {
    const sid = chatSessionOf(focusLeaf.active);
    if (!sid || !hostState.sessionFile) return; // 会话信息未就绪（getState 未回）——等
    if (hostState.sessionFile !== sid) {
      rpcRef.current?.request("pi:switchSession", { path: sid }).catch(() => undefined);
    }
  }, [focusLeaf.active, hostState.sessionFile]);

  // R26：主题偏好（localStorage 持久化）+ 系统深浅（toast 联动）
  const [themePref, setThemePref] = useState<ThemePreference>(() => loadPreference(window.localStorage));
  const [systemScheme, setSystemScheme] = useState<Scheme>(() =>
    parseSystemScheme((query) => window.matchMedia(query)),
  );

  const onThemeChange = useCallback((pref: ThemePreference) => {
    setThemePref(pref);
    savePreference(window.localStorage, pref);
  }, []);

  useEffect(() => {
    // 系统深浅变化（跟随系统模式实时跟随；固定深浅时 resolveTheme 忽略）
    return watchSystemScheme(() =>
      setSystemScheme(parseSystemScheme((query) => window.matchMedia(query))),
    );
  }, []);

  // 偏好或系统色板变化 → 统一应用 DOM（单一路径；main.tsx 仅负责首帧防闪屏）
  useEffect(() => {
    applyTheme(themePref);
  }, [themePref, systemScheme]);

  /** 稳定引用：ContextPanel 挂载时取最新 rpc（避免每次渲染重建导致重拉） */
  const getRequest = useCallback(() => {
    const c = rpcRef.current;
    if (!c) throw new Error("未连接");
    return c.request;
  }, []);

  useEffect(() => {
    const token = new URLSearchParams(location.search).get("token") ?? "";
    if (!token) {
      toast.error("缺少 token：请从 /web 输出的完整 URL 打开");
      setBooted(true);
      return;
    }
    const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws?token=${encodeURIComponent(token)}`;
    const client = createRpcClient({
      url,
      onConnState: (s) => {
        setConn(s);
        dispatchToActiveChat({ type: "conn", state: s });
      },
      onEvent: (evt) => {
        // multi-instance：agent 事件按进程分发；普通事件归宿主进程
        if (evt.type === "agent-event") {
          const pid = typeof evt.processId === "string" ? evt.processId : "";
          if (!pid) return;
          // usage 上报：按进程 → 会话 → meter 数据（非流式 action——单独处理）
          const inner = evt.event as PiEvent;
          if (inner.type === "usage_update") {
            const entry = agentsRef.current.find((ag) => ag.processId === pid);
            if (entry?.sessionFile) {
              const percent = typeof inner.percent === "number" ? inner.percent : null;
              const tokens = typeof inner.tokens === "number" ? inner.tokens : null;
              const contextWindow = typeof inner.contextWindow === "number" ? inner.contextWindow : null;
              setUsageBySession((prev) => ({ ...prev, [entry.sessionFile as string]: { percent, tokens, contextWindow } }));
            }
            return;
          }
          const action = toAction(inner);
          if (!action) return;
          if (isTransitionalAction(action)) {
            startTransition(() => dispatchToProcess(pid, action));
          } else {
            dispatchToProcess(pid, action);
          }
          return;
        }
        // agent 进程退出 → 对应 tab 断线标记（保留 + 可重新拉起）
        if (evt.type === "agent_closed") {
          const pid = typeof evt.processId === "string" ? evt.processId : "";
          const entry = agentsRef.current.find((ag) => ag.processId === pid);
          if (entry?.sessionFile)
            dispatchWs({
              kind: "dead-chat",
              groupId: findGroupOfTree(workspaceTreeRef.current, chatTabId(entry.sessionFile)) ?? focusRef.current,
              sessionId: entry.sessionFile,
            });
          return;
        }
        // TUI 接管提示（TUI 切到 web 已实例化的会话 → 该实例被杀）
        if (evt.type === "tui_takeover") {
          toast.info("该会话已由 TUI 接管，实例已释放");
          return;
        }
        // 注册进程列表 → chat tab 生命周期（join 开 tab + 激活；leave 关 tab）
        // ——必须在 toAction 之前（agent_list 不是流式 action，toAction 返回 null 会提前 return）
        if (evt.type === "agent_list") {
          const list = (evt as { agents?: AgentInfo[] }).agents ?? [];
          syncAgents(list);
          return;
        }
        const action = toAction(evt as PiEvent);
        if (!action) return;
        // R23 F5：高频流式事件（text_delta/thinking_delta/tool_update）包 transition，
        // 避免每 delta 同步渲染阻塞输入/滚动；消息边界保持同步
        if (isTransitionalAction(action)) {
          startTransition(() => dispatchToActiveChat(action));
        } else {
          dispatchToActiveChat(action);
        }
        // 会话切换完成：会话列表刷新（历史由 ChatTab 自管——state 事件匹配后首次加载）
        if (evt.type === "session_switch_ready") {
          refreshSessions();
        }
        // R26 session-follow：特权状态广播（TUI 切换 → 立即降级提示；重跑 /web → 自动恢复）
        if (action.type === "privilege_status") {
          // 降级提示由 SessionList 常驻提示条表达（spec 范围）；此处只同步状态（ok 已由 toAction 归一化）
          setDegraded(!action.ok);
        }
      },
    });
    rpcRef.current = client;
    client.connect();
    setBooted(true);
    return () => client.disconnect();
  }, []);

  /** 注册进程列表 → chat tab 生命周期（join 开 tab+激活；leave 关 tab——diff 纯决策） */
  const syncAgents = useCallback((list: AgentInfo[]) => {
    setAgents(list);
    agentsRef.current = list;
    // R27：注册表为空（服务端重启/重连初期瞬态）不驱动 leave 关闭——树是持久状态，
    // 瞬态空列表会误关所有 tab（agent 退出走 agent_closed → dead 标记，不依赖 leave）
    if (list.length === 0) return;
    // R27：diff 基于完整树展平（workspaceRef 只是单 leaf——split 后其他组的 tab 会被误判为未开而重复 open）
    const flat = { ...workspaceRef.current, tabs: flattenTabs(workspaceTreeRef.current) };
    const diff = diffAgentTabs(flat, list);
    for (const j of diff.join) {
      // dead 的 tab 原地复活（清 dead 标记——agent 重连；历史由 ChatTab 实例重挂/事件流恢复）。
      // R27：不能 close→open（close 触发空组合并，原组消失后 open 落空 → tab 丢失、布局破坏）
      if (chatLeaveAction(flat.tabs, j.sessionFile) === "keep") {
        dispatchWs({ kind: "revive-chat", sessionId: j.sessionFile });
        continue;
      }
      dispatchWs({ kind: "open-chat", groupId: focusRef.current, sessionId: j.sessionFile, name: j.sessionName ?? sessionLabelFromFile(j.sessionFile) });
      dispatchWs({ kind: "activate", groupId: focusRef.current, id: chatTabId(j.sessionFile) });
    }
    for (const sid of diff.leave) {
      // dead（断线保留待重拉）保持；正常消失（TUI 切换）关闭
      if (chatLeaveAction(flat.tabs, sid) === "close") {
        dispatchWs({ kind: "close-chat", sessionId: sid });
      }
    }
  }, []);

  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // App 常驻：卸载清理重试定时器（防御性）
  useEffect(() => () => { if (retryTimerRef.current) clearTimeout(retryTimerRef.current); }, []);
  const refreshSessions = useCallback((retry = true) => {
    // R26 session-follow：切换瞬间 ctx 可能未就绪（requireCtx 抛"切换中"）——失败延迟重试一次
    rpcRef.current
      ?.request<SessionInfo[]>("pi:listSessions")
      .then(setSessions)
      .catch(() => {
        if (retry) {
          if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
          retryTimerRef.current = setTimeout(() => refreshSessions(false), 400);
        }
      });
  }, []);


  // 连接建立后拉取初始数据
  useEffect(() => {
    if (conn !== "open" || !rpcRef.current) return;
    const c = rpcRef.current;
    c.request<WebState>("pi:getState")
      .then((st) => {
        // 先直接镜像会话元数据（ChatTab 未挂载时 state 事件会丢——激活 effect 需要 sessionFile）
        setHostState((prev) => ({ ...prev, ...pickStreamMeta(st as unknown as StreamState) }));
        dispatchToActiveChat({ type: "state", state: st as unknown as Record<string, unknown> });
        // 无注册者 → 空态引导；会话 tab 由注册者（agent_list / 会话管理打开）驱动
      })
      .catch((e) => toast.error(`getState: ${e.message}`));
    refreshSessions();
    c.request<ModelInfo[]>("pi:listModels").then(setModels).catch(() => undefined);
    c.request<{ agents?: AgentInfo[] }>("pi:agentList")
      .then((r) => syncAgents(r.agents ?? []))
      .catch(() => undefined);
  }, [conn, refreshSessions]);

  // 上拉框数据（懒加载：面板首次触发时刷新）
  const refreshPicker = useCallback(() => {
    const c = rpcRef.current;
    if (!c || conn !== "open") return;
    setPickerLoading(true);
    Promise.all([
      c.request<SkillInfo[]>("pi:listSkills").catch(() => [] as SkillInfo[]),
      c.request<CommandInfo[]>("pi:listCommands").catch(() => [] as CommandInfo[]),
      c.request<FileGroup[]>("pi:listFiles").catch(() => [] as FileGroup[]),
    ])
      .then(([sk, cm, fl]) => {
        setSkills(sk);
        setCommands(cm);
        setFiles(fl);
      })
      .finally(() => setPickerLoading(false));
  }, [conn]);

  // 连接建立后预拉上拉框数据（skills/commands/files）：
  // 避免首次 space+/ 或 space+@ 触发时 conn 未就绪（refreshPicker 内 return）导致空面板
  useEffect(() => {
    if (conn === "open") refreshPicker();
  }, [conn, refreshPicker]);

  // R25：web 提问工具回答 → RPC 通道（resolve 服务器端阻塞的 execute）
  const compact = useCallback(() => {
    rpcRef.current?.request("pi:compact").catch((e) => toast.error(`compact: ${e.message}`));
  }, []);

  const setModel = useCallback((provider: string, modelId: string) => {
    rpcRef.current?.request("pi:setModel", { provider, modelId }).then(() => {
      toast.success(`已切换 ${provider}/${modelId}`);
    }).catch((e) => toast.error(`setModel: ${e.message}`));
  }, []);

  const setThinking = useCallback((level: string) => {
    rpcRef.current?.request("pi:setThinkingLevel", { level }).catch((e) => toast.error(`setThinkingLevel: ${e.message}`));
  }, []);

  /** 特权操作统一错误处理：降级提示 */
  const privilegedError = useCallback((e: Error, action: string) => {
    if (isPrivilegedError(e)) {
      setDegraded(true);
      toast.error(e.message);
    } else {
      toast.error(`${action}: ${e.message}`);
    }
  }, []);

  /** 打开会话 tab（会话管理点击）——激活时自动切换进程会话 */
  const openChat = useCallback((path: string, name: string) => {
    // R27：决策基于完整树展平（workspaceRef 只是单 leaf——split 后其他组已开的会话会被误判为"无 tab"而重复 open/spawn）
    const flat = { ...workspaceRef.current, tabs: flattenTabs(workspaceTreeRef.current) };
    const decision = chatOpenAction(flat, agentsRef.current, path);
    if (decision.kind === "activate") {
      // 已开 tab：激活其所在组（而非聚焦组——tab 不跨组移动）
      dispatchWs({ kind: "activate", groupId: findGroupOfTree(workspaceTreeRef.current, chatTabId(path)) ?? focusRef.current, id: chatTabId(path) });
      return;
    }
    if (decision.kind === "open") {
      dispatchWs({ kind: "open-chat", groupId: focusRef.current, sessionId: path, name: name || decision.name });
      dispatchWs({ kind: "activate", groupId: focusRef.current, id: chatTabId(path) });
      return;
    }
    // 无实例：服务进程 spawn 独立实例 → agent_list 事件自动开 tab
    const c = rpcRef.current;
    if (!c) return;
    // TUI 注册者（live external）正在使用的会话：不允许 spawn（jsonl 双写守卫）
    const tuiOwned = agentsRef.current.some((ag) => ag.kind !== "spawned" && ag.sessionFile === path);
    if (tuiOwned) {
      toast.info("该会话由 TUI 进程使用中——先在 TUI 切走再在 web 打开");
      return;
    }
    c.request<{ processId: string }>("pi:openSession", { path })
      .then(() => undefined)
      .catch((e) => toast.error(`会话实例化失败：${e.message}`));
  }, []);

  /** 新建会话：spawn 独立实例（--session-id）→ agent_list join 自动开 tab */
  const newChatSession = useCallback(() => {
    const c = rpcRef.current;
    if (!c) return;
    c.request<{ processId: string }>("pi:newChatSession")
      .then(() => undefined)
      .catch((e) => toast.error(`新建会话失败：${e.message}`));
  }, []);

  const fork = useCallback((userIndex: number) => {
    const c = rpcRef.current;
    if (!c) return;
    c.request<{ cancelled: boolean }>("pi:fork", { userIndex })
      .then((r) => {
        if (r.cancelled) toast.info("fork 已取消");
        else toast.success("已从此轮分叉新会话");
      })
      .catch((e) => privilegedError(e, "fork"));
  }, [privilegedError]);

  const clone = useCallback(() => {
    const c = rpcRef.current;
    if (!c) return;
    c.request<{ cancelled: boolean }>("pi:clone")
      .then((r) => {
        if (r.cancelled) toast.info("克隆已取消");
        else toast.success("已复制当前会话");
      })
      .catch((e) => privilegedError(e, "复制会话"));
  }, [privilegedError]);

  const navigateTree = useCallback((targetId: string) => {
    const c = rpcRef.current;
    if (!c) return;
    c.request<{ cancelled: boolean }>("pi:navigateTree", { targetId })
      .then((r) => {
        if (r.cancelled) toast.info("导航已取消");
        else {
          toast.success("已导航到该节点");
          setTreeOpen(false);
        }
      })
      .catch((e) => privilegedError(e, "树导航"));
  }, [privilegedError]);

  const openTree = useCallback(() => {
    const c = rpcRef.current;
    if (!c) return;
    setTreeOpen(true);
    setTreeLoading(true);
    c.request<{ tree: TreeNode[]; leafId: string | null }>("pi:getTree")
      .then((r) => {
        setTree(r.tree);
        setLeafId(r.leafId);
      })
      .catch((e) => toast.error(`getTree: ${e.message}`))
      .finally(() => setTreeLoading(false));
  }, []);

  const deleteSession = useCallback((path: string) => {
    const c = rpcRef.current;
    if (!c) return;
    c.request("pi:deleteSession", { path })
      .then(() => {
        toast.success("会话已删除");
        refreshSessions();
      })
      .catch((e) => toast.error(`删除: ${e.message}`));
  }, [refreshSessions]);

  const renameSession = useCallback((_path: string, name: string) => {
    const c = rpcRef.current;
    if (!c) return;
    c.request("pi:setSessionName", { name })
      .then(() => {
        toast.success(name ? `已重命名为 ${name}` : "已清除名称");
        refreshSessions();
      })
      .catch((e) => toast.error(`重命名: ${e.message}`));
  }, [refreshSessions]);

  const sessionActions = useMemo(
    () => ({
      onSelect: openChat,
      onNew: newChatSession,
      onDelete: deleteSession,
      onRename: renameSession,
      onClone: clone,
      onShowTree: openTree,
      onRefresh: refreshSessions,
    }),
    [openChat, newChatSession, deleteSession, renameSession, clone, openTree, refreshSessions],
  );

  const sessionPanelProps = useMemo(
    () => ({
      sessions,
      currentSessionFile: hostState.sessionFile,
      openSessionFiles: new Set(agents.filter((ag) => ag.sessionFile).map((ag) => ag.sessionFile as string)),
      bridge: hostState.bridge,
      sessionDegraded: degraded,
      sessionActions,
    }),
    [sessions, hostState.sessionFile, agents, hostState.bridge, degraded, sessionActions],
  );

  const settingsPanelProps = useMemo(
    () => ({
      models,
      currentModel: hostState.model ? `${hostState.model.provider}/${hostState.model.id}` : null,
      thinkingLevel: hostState.thinkingLevel,
      thinkingLevels: hostState.availableThinkingLevels,
      onSetModel: setModel,
      onSetThinking: setThinking,
      themePreference: themePref,
      onThemeChange,
    }),
    [models, hostState.model, hostState.thinkingLevel, hostState.availableThinkingLevels, setModel, setThinking, themePref, onThemeChange],
  );

  // 02：叶子内容渲染（TabsBar + chat/file/diff 内容区——常驻挂载模式不变，leaf 参数化）
  const renderLeafContent = (leaf: LeafNode): ReactNode => {
    const tabs = leaf.tabs;
    const active = leaf.active;
    return (
      <>
        <TabsBar
          tabs={tabs}
          active={active}
          onActivate={(id) => {
            setFocusGroupId(leaf.groupId);
            dispatchWs({ kind: "activate", groupId: leaf.groupId, id });
          }}
          onMove={(fromId, toId) => {
            setFocusGroupId(leaf.groupId);
            dispatchWs({ kind: "move", groupId: leaf.groupId, fromId, toId });
          }}
          onDropTab={(fromId) => {
            setFocusGroupId(leaf.groupId);
            dispatchWs({ kind: "move", groupId: leaf.groupId, fromId, toId: null });
          }}
          onClose={(id) => {
            if (chatSessionOf(id) !== null) {
              // chat 与 file 同级：直接关闭；spawn 实例同步杀进程（TUI 注册者保留注册）
              const sid = chatSessionOf(id) as string;
              delete chatDraftsRef.current[sid]; // review：关闭后清草稿（无界增长）
              // R28：关闭清理——防陈旧快照污染重开（重开应重拉历史/恢复滚动）
              delete chatStatesRef.current[sid];
              delete chatScrollAnchorsRef.current[sid];
              const entry = agents.find((ag) => ag.sessionFile === sid);
              if (entry && entry.kind === "spawned") {
                rpcRef.current?.request("pi:closeAgent", { processId: entry.processId }).catch(() => undefined);
              }
              dispatchWs({ kind: "close", groupId: leaf.groupId, id });
              return;
            }
            if (tabDirty(leaf, id)) {
              setPendingClose({ groupId: leaf.groupId, id });
            } else {
              delete editorStatesRef.current[id]; // R28：file 关闭清理
              dispatchWs({ kind: "close", groupId: leaf.groupId, id });
            }
          }}
          onDragStartTab={setDragTabId}
          dragId={dragTabId}
        />
        <div className="min-h-0 flex-1">
          {active === "" && tabs.length === 0 && <ChatEmptyGuide />}
          {/* chat 与 file 同级常驻挂载（hidden 保状态——input/滚动不丢）；conn open 才挂 ChatTab */}
          {conn === "open" &&
            tabs
              .filter((t) => t.kind === "chat")
              .map((t) => (
                <div key={t.sessionId} className={chatTabId(t.sessionId) === active ? "h-full" : "hidden"}>
                  <ChatTab
                    sessionId={t.sessionId}
                    name={t.name}
                    processId={agents.find((ag) => ag.sessionFile === t.sessionId)?.processId ?? ""}
                    dead={t.kind === "chat" && t.dead === true}
                    usage={usageBySession[t.sessionId] ?? null}
                    onRevive={(sid) => openChat(sid, t.kind === "chat" ? t.name : "聊天")}
                    active={chatTabId(t.sessionId) === active}
                    request={getRequest()}
                    conn={conn}
                    skills={skills}
                    commands={commands}
                    files={files}
                    pickerLoading={pickerLoading}
                    onPickerOpen={refreshPicker}
                    onFork={fork}
                    draftText={chatDraftsRef.current[t.sessionId]}
                    onDraftChange={(text) => handleDraftChange(t.sessionId, text)}
                    savedState={chatStatesRef.current[t.sessionId]}
                    onStateSave={handleStateSave}
                    scrollAnchor={chatScrollAnchorsRef.current[t.sessionId] ?? null}
                    onScrollAnchorSave={handleScrollAnchorSave}
                    onRegisterDispatch={registerDispatch}
                    onUnregisterDispatch={unregisterDispatch}
                    onStateChange={handleTabStateChange}
                  />
                </div>
              ))}
          {tabs
            .filter((t) => t.kind === "file")
            .map((t) => (
              <div key={t.path} className={active === t.path ? "h-full" : "hidden"}>
                {conn === "open" && fileDeferred ? (
                <EditorPane
                  path={t.path}
                  request={getRequest()}
                  ref={(h) => {
                    editorRefs.current[t.path] = h;
                  }}
                  onDirtyChange={(path, dirty) => {
                    dispatchWs({ kind: "dirty", groupId: leaf.groupId, path, dirty });
                    if (dirty) dispatchWs({ kind: "promote", groupId: leaf.groupId, path }); // 编辑自动转正式
                  }}
                  onSaved={() => setGitRefreshKey((k) => k + 1)}
                  savedState={editorStatesRef.current[t.path]}
                  onStateSave={handleEditorStateSave}
                />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-muted-foreground">加载中…</div>
                )}
              </div>
            ))}
          {tabs
            .filter((t) => t.kind === "diff")
            .map((t) => (
              <div key={`diff:${t.path}`} className={active === `diff:${t.path}` ? "h-full" : "hidden"}>
                <DiffSplitView path={t.path} request={getRequest()} repoRoot={t.repoRoot} />
              </div>
            ))}
        </div>
      </>
    );
  };

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <div className="relative flex min-h-0 flex-1">
        <ActivityBar
          active={panel}
          onSelect={(p) => {
            // 活动栏只切侧边栏——主区内容由 tab 决定（chat tab 常驻，主区不空）
            setPanel(p);
          }}
        />
        {panel !== null && (
          <aside
            className="app-panel-shell bg-sidebar relative shrink-0 border-r"
            aria-label={`${panel === "files" ? "文件" : panel === "git" ? "Git" : panel === "sessions" ? "会话" : "设置"} 面板`}
            style={{ width: panelWidth }}
          >
            <div
              className="hover:bg-primary/30 absolute top-0 right-0 z-10 h-full w-1 cursor-col-resize"
              title="拖拽调整宽度"
              onMouseDown={onResizeStart}
            />

            {panel === "files" && (
              <FilesTree
                request={getRequest()}
                onOpenFile={(path, name, preview) => dispatchWs({ kind: "open", groupId: focusRef.current, path, name, preview })}
                activePath={chatSessionOf(workspace.active) !== null ? null : workspace.active}
                gitRefreshKey={gitRefreshKey}
                onOpenDiff={(path) => dispatchWs({ kind: "open-diff", groupId: focusRef.current, path, name: path.split("/").pop() ?? path })}
              />
            )}
            {panel === "git" && <GitPanel request={getRequest()} gitRefreshKey={gitRefreshKey} onOpenFile={(path, repoRoot) => dispatchWs({ kind: "open-diff", groupId: focusRef.current, path, name: path.split("/").pop() ?? path, repoRoot })} />}
            {panel === "sessions" && <SessionPanel {...sessionPanelProps} />}
            {panel === "settings" && <SettingsPanel {...settingsPanelProps} />}
          </aside>
        )}
        <main id="workspace-main" className="flex min-h-0 min-w-0 flex-1 flex-col">
          <DisconnectBannerMemo conn={conn} />
          <SplitView
            tree={workspaceTree}
            dragTabId={dragTabId}
            onSplit={(groupId, side, tabId) => {
              setFocusGroupId(groupId);
              dispatchWs({ kind: "split", groupId, side, tabId });
            }}
            onJoin={(groupId, tabId) => {
              setFocusGroupId(groupId);
              dispatchWs({ kind: "move", groupId, fromId: tabId, toId: null });
            }}
            onRatio={(splitId, ratio) => dispatchWs({ kind: "set-ratio", splitId, ratio })}
            renderLeaf={renderLeafContent}
          />
        </main>
      </div>
      <Dialog
        open={pendingClose !== null}
        onOpenChange={(open) => {
          if (!open) setPendingClose(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>保存对 {pendingClose ? pendingClose.id.split("/").pop() : ""} 的更改？</DialogTitle>
            <DialogDescription>文件有未保存的修改，关闭前请选择处理方式。</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                if (pendingClose) {
                  delete editorStatesRef.current[pendingClose.id]; // R28：file 关闭清理
                  dispatchWs({ kind: "close", groupId: pendingClose.groupId, id: pendingClose.id });
                }
                setPendingClose(null);
              }}
            >
              不保存
            </Button>
            <Button
              disabled={pendingSaving}
              onClick={async () => {
                if (!pendingClose) return;
                setPendingSaving(true);
                const ok = await editorRefs.current[pendingClose.id]?.save();
                setPendingSaving(false);
                if (ok) {
                  delete editorStatesRef.current[pendingClose.id]; // R28：file 关闭清理（保存后）
                  dispatchWs({ kind: "close", groupId: pendingClose.groupId, id: pendingClose.id });
                  setPendingClose(null);
                }
              }}
            >
              {pendingSaving ? "保存中…" : "保存"}
            </Button>
            <Button variant="secondary" onClick={() => setPendingClose(null)}>
              取消
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <TreeDialog
        open={treeOpen}
        onOpenChange={setTreeOpen}
        tree={tree}
        loading={treeLoading}
        currentLeafId={leafId}
        navigable={!degraded}
        onNavigate={navigateTree}
      />
      <Toaster position="top-right" theme={resolveTheme(themePref, systemScheme).scheme} />
    </div>
  );
}
