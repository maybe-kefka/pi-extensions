import { memo, startTransition, useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { toast } from "sonner";
import { createRpcClient, type RpcClient } from "@/shared/api/rpc";
import { initialState, type StreamAction, type StreamState } from "@/entities/chat/stream";
import { isTransitionalAction, toAction } from "@/entities/chat/events";
import type { CommandInfo, FileGroup, HistoryMessage, ModelInfo, PiEvent, SessionInfo, SkillInfo, TreeNode, WebState } from "@/entities/chat/types";
import { Header } from "@/app/ui/Header";
import { ChatTab } from "@/features/chat-stream/ChatTab";
import { FilesTree } from "@/features/files/FilesTree";
import { EditorPane } from "@/features/files/EditorPane";
import { DiffSplitView } from "@/features/files/DiffSplitView";
import { TabsBar } from "@/features/editor-tabs/TabsBar";
import { Button } from "@/shared/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import {
  activateTab,
  chatSessionOf,
  chatTabId,
  closeChatTab,
  closeTab,
  diffPathOf,
  initialState as initialWorkspace,
  openChatTab,
  openDiffTab,
  openFile,
  renameChatTab,
  promotePreview,
  setDirty,
  tabDirty,
  type WorkspaceState,
} from "@/entities/workspace/tabs";
import type { EditorPaneHandle } from "@/features/files/EditorPane";
import { clampPanelWidth, loadPanelWidth, savePanelWidth } from "@/entities/workspace/layout";
import { ActivityBar, type ActivityPanel } from "@/features/activity-bar/ActivityBar";
import { SessionPanel } from "@/features/sessions/SessionPanel";
import { SettingsPanel } from "@/features/settings/SettingsPanel";
import { GitPanel } from "@/features/git-panel/GitPanel";
import { InputBar } from "@/features/input-bar/InputBar";
import { DisconnectBanner } from "@/app/ui/DisconnectBanner";
import { TreeDialog } from "@/features/sessions/TreeDialog";
import { Toaster } from "@/shared/ui/sonner";
import { applyTheme, watchSystemScheme } from "@/app/apply-theme";
import {
  loadPreference,
  parseSystemScheme,
  resolveTheme,
  savePreference,
  type Scheme,
  type ThemePreference,
} from "@/entities/theme/theme";


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
  const [hostState, setHostState] = useState(initialState);
  const [conn, setConn] = useState(initialState.conn);
  /** 新建会话待开 tab 标记（session_switch_ready 时消费） */
  const pendingNewRef = useRef(false);
  /** 激活 chat tab 状态上报（会话元数据：sessionName/sessionFile/context——ChatTab 仅在激活时上报） */
  const handleTabStateChange = useCallback((sessionId: string, st: typeof initialState) => {
    if (sessionId === chatSessionOf(workspaceRef.current.active)) setHostState(st);
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
    dispatchersRef.current[processId]?.(action);
  }, []);
  /** 分发到激活 chat tab（进程当前会话 = 激活 tab——流式/conn 事件走这里） */
  const dispatchToActiveChat = useCallback((action: StreamAction) => {
    const sid = chatSessionOf(workspaceRef.current.active);
    if (sid) dispatchersRef.current[sid]?.(action);
  }, []);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
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
  const [pendingClose, setPendingClose] = useState<string | null>(null);
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
  // vscode-align：工作区 tab 状态（文件 tab + 聊天 tab）
  const [workspace, dispatchWs] = useReducer(
    (
      s: WorkspaceState,
      a:
        | { kind: "open"; path: string; name: string; preview?: boolean }
        | { kind: "open-diff"; path: string; name: string; repoRoot?: string }
        | { kind: "activate"; id: string }
        | { kind: "close"; id: string }
        | { kind: "dirty"; path: string; dirty: boolean }
        | { kind: "promote"; path: string }
        | { kind: "rename-chat"; sessionId: string; name: string }
        | { kind: "open-chat"; sessionId: string; name: string },
    ): WorkspaceState => {
      switch (a.kind) {
        case "open":
          return openFile(s, a.path, a.name, { preview: a.preview });
        case "open-diff":
          return openDiffTab(s, a.path, a.name, a.repoRoot);
        case "activate":
          return activateTab(s, a.id);
        case "close":
          return closeTab(s, a.id);
        case "dirty":
          return setDirty(s, a.path, a.dirty);
        case "promote":
          return promotePreview(s, a.path);
        case "rename-chat":
          return renameChatTab(s, a.sessionId, a.name);
        case "open-chat":
          return openChatTab(s, a.sessionId, a.name);
      }
    },
    undefined,
    initialWorkspace,
  );
  // workspace 最新引用（事件回调闭包读取）
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;

  // host 会话名变化 → 激活 chat tab 标题同步（若有）
  useEffect(() => {
    const sid = chatSessionOf(workspace.active);
    if (hostState.sessionName && sid) dispatchWs({ kind: "rename-chat", sessionId: sid, name: hostState.sessionName });
  }, [hostState.sessionName, workspace.active]);

  // 激活 chat tab：会话不同 → 切换进程会话（历史由 ChatTab 首次加载；切回不重拉）
  useEffect(() => {
    const sid = chatSessionOf(workspace.active);
    if (!sid || !hostState.sessionFile) return; // 会话信息未就绪（getState 未回）——等
    if (hostState.sessionFile !== sid) {
      rpcRef.current?.request("pi:switchSession", { path: sid }).catch(() => undefined);
    }
  }, [workspace.active, hostState.sessionFile]);

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
          const action = toAction(evt.event as PiEvent);
          if (!action) return;
          if (isTransitionalAction(action)) {
            startTransition(() => dispatchToProcess(pid, action));
          } else {
            dispatchToProcess(pid, action);
          }
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
          if (pendingNewRef.current) {
            // 新建会话：打开新会话的 chat tab（历史由 ChatTab 首次激活加载）
            pendingNewRef.current = false;
            rpcRef.current?.request<WebState>("pi:getState").then((st) => {
              const sf = (st as unknown as { sessionFile?: string | null }).sessionFile;
              const raw = (st as unknown as { sessionName?: string | null }).sessionName;
              const name = raw || (sf ? sessionLabelFromFile(sf) : "聊天");
              if (sf) dispatchWs({ kind: "open-chat", sessionId: sf, name });
            }).catch(() => undefined);
          }
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

  const refreshSessions = useCallback((retry = true) => {
    // R26 session-follow：切换瞬间 ctx 可能未就绪（requireCtx 抛"切换中"）——失败延迟重试一次
    rpcRef.current
      ?.request<SessionInfo[]>("pi:listSessions")
      .then(setSessions)
      .catch(() => {
        if (retry) setTimeout(() => refreshSessions(false), 400);
      });
  }, []);


  // 连接建立后拉取初始数据
  useEffect(() => {
    if (conn !== "open" || !rpcRef.current) return;
    const c = rpcRef.current;
    c.request<WebState>("pi:getState")
      .then((st) => {
        // 先直接镜像会话元数据（ChatTab 未挂载时 state 事件会丢——激活 effect 需要 sessionFile）
        setHostState((prev) => ({ ...prev, ...(st as unknown as Partial<StreamState>) }));
        dispatchToActiveChat({ type: "state", state: st as unknown as Record<string, unknown> });
        // 默认打开当前会话的 chat tab（chat 与 file 同级——可开可关）
        const sf = (st as unknown as { sessionFile?: string | null }).sessionFile;
        const name = (st as unknown as { sessionName?: string | null }).sessionName ?? "聊天";
        if (sf) dispatchWs({ kind: "open-chat", sessionId: sf, name });
      })
      .catch((e) => toast.error(`getState: ${e.message}`));
    refreshSessions();
    c.request<ModelInfo[]>("pi:listModels").then(setModels).catch(() => undefined);
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
    dispatchWs({ kind: "open-chat", sessionId: path, name: name || path.split("/").pop() || "聊天" });
  }, []);

  /** 新建会话：服务端 newSession → 会话切换完成后自动打开对应 tab */
  const newChatSession = useCallback(() => {
    const c = rpcRef.current;
    if (!c) return;
    c.request<{ cancelled: boolean }>("pi:newSession")
      .then((r) => {
        if (r.cancelled) toast.info("新建已取消");
        else pendingNewRef.current = true;
      })
      .catch((e) => privilegedError(e, "新建会话"));
  }, [privilegedError]);

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
      bridge: hostState.bridge,
      sessionDegraded: degraded,
      sessionActions,
    }),
    [sessions, hostState.sessionFile, hostState.bridge, degraded, sessionActions],
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

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <Header conn={conn} state={hostState} onCompact={compact} getRequest={getRequest} />
      <div className="flex min-h-0 flex-1">
        <ActivityBar
          active={panel}
          onSelect={(p) => {
            // 活动栏只切侧边栏——主区内容由 tab 决定（chat tab 常驻，主区不空）
            setPanel(p);
          }}
        />
        {panel !== null && (
          <aside className="relative shrink-0 border-r" style={{ width: panelWidth }}>
            <div
              className="hover:bg-primary/30 absolute top-0 right-0 z-10 h-full w-1 cursor-col-resize"
              title="拖拽调整宽度"
              onMouseDown={onResizeStart}
            />

            {panel === "files" && (
              <FilesTree
                request={getRequest()}
                onOpenFile={(path, name, preview) => dispatchWs({ kind: "open", path, name, preview })}
                activePath={chatSessionOf(workspace.active) !== null ? null : workspace.active}
                gitRefreshKey={gitRefreshKey}
                onOpenDiff={(path) => dispatchWs({ kind: "open-diff", path, name: path.split("/").pop() ?? path })}
              />
            )}
            {panel === "git" && <GitPanel request={getRequest()} gitRefreshKey={gitRefreshKey} onOpenFile={(path, repoRoot) => dispatchWs({ kind: "open-diff", path, name: path.split("/").pop() ?? path, repoRoot })} />}
            {panel === "sessions" && <SessionPanel {...sessionPanelProps} />}
            {panel === "settings" && <SettingsPanel {...settingsPanelProps} />}
          </aside>
        )}
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          <TabsBar
            tabs={workspace.tabs}
            active={workspace.active}
            onActivate={(id) => dispatchWs({ kind: "activate", id })}
            onClose={(id) => {
              if (chatSessionOf(id) !== null) {
                // chat 与 file 同级：直接关闭（不切会话——进程保持当前）
                dispatchWs({ kind: "close", id });
                return;
              }
              if (tabDirty(workspace, id)) {
                setPendingClose(id);
              } else {
                dispatchWs({ kind: "close", id });
              }
            }}
            onSave={() => {
              const active = workspace.active;
              if (chatSessionOf(active) === null) void editorRefs.current[active]?.save();
            }}
          />
      <div className="min-h-0 flex-1">
          <DisconnectBannerMemo conn={conn} />
          {workspace.active === "" && (
            <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
              从侧边栏打开会话或文件
            </div>
          )}
          {/* chat 与 file 同级常驻挂载（hidden 保状态——input/滚动不丢）；conn open 才挂 ChatTab */}
          {conn === "open" && workspace.tabs
            .filter((t) => t.kind === "chat")
            .map((t) => (
              <div key={t.sessionId} className={chatTabId(t.sessionId) === workspace.active ? "h-full" : "hidden"}>
                <ChatTab
                  sessionId={t.sessionId}
                  name={t.name}
                  active={chatTabId(t.sessionId) === workspace.active}
                  request={getRequest()}
                  conn={conn}
                  skills={skills}
                  commands={commands}
                  files={files}
                  pickerLoading={pickerLoading}
                  onPickerOpen={refreshPicker}
                  onFork={fork}
                  onRegisterDispatch={registerDispatch}
                  onUnregisterDispatch={unregisterDispatch}
                  onStateChange={handleTabStateChange}
                />
              </div>
            ))}
          {workspace.tabs
            .filter((t) => t.kind === "file")
            .map((t) => (
              <div key={t.path} className={workspace.active === t.path ? "h-full" : "hidden"}>
                <EditorPane
                  path={t.path}
                  request={getRequest()}
                  ref={(h) => {
                    editorRefs.current[t.path] = h;
                  }}
                  onDirtyChange={(path, dirty) => {
                    dispatchWs({ kind: "dirty", path, dirty });
                    if (dirty) dispatchWs({ kind: "promote", path }); // 编辑自动转正式
                  }}
                  onSaved={() => setGitRefreshKey((k) => k + 1)}
                />
              </div>
            ))}
          {workspace.tabs
            .filter((t) => t.kind === "diff")
            .map((t) => (
              <div key={`diff:${t.path}`} className={workspace.active === `diff:${t.path}` ? "h-full" : "hidden"}>
                <DiffSplitView path={t.path} request={getRequest()} repoRoot={t.repoRoot} />
              </div>
            ))}
        </div>
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
            <DialogTitle>保存对 {pendingClose ? pendingClose.split("/").pop() : ""} 的更改？</DialogTitle>
            <DialogDescription>文件有未保存的修改，关闭前请选择处理方式。</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                if (pendingClose) dispatchWs({ kind: "close", id: pendingClose });
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
                const ok = await editorRefs.current[pendingClose]?.save();
                setPendingSaving(false);
                if (ok) {
                  dispatchWs({ kind: "close", id: pendingClose });
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
