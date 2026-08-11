import { memo, startTransition, useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { toast } from "sonner";
import { createRpcClient, type RpcClient } from "@/shared/api/rpc";
import { initialState, type StreamAction } from "@/entities/chat/stream";
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
  chatProcessOf,
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

export default function App() {
  const [hostState, setHostState] = useState(initialState);
  const [conn, setConn] = useState(initialState.conn);
  /** agent_list：新注册进程 → 打开 chat tab */
  const setWorkspaceAgents = useCallback((agents: Array<{ processId: string; sessionName: string | null }>) => {
    dispatchWs({ kind: "agent-list", agents });
  }, []);

  /** agent_closed：进程注销 → 关闭对应 chat tab */
  const setWorkspaceAgentsClosed = useCallback((processId: string) => {
    dispatchWs({ kind: "agent-closed", processId });
  }, []);

  /** host tab 状态上报（会话元数据：sessionName/sessionFile/context/streaming——低频使用） */
  const handleTabStateChange = useCallback((processId: string, st: typeof initialState) => {
    if (processId === "host") setHostState(st);
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
        | { kind: "agent-list"; agents: Array<{ processId: string; sessionName: string | null }> }
        | { kind: "agent-closed"; processId: string }
        | { kind: "rename-chat"; processId: string; name: string },
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
        case "agent-list": {
          let next = s;
          for (const agent of a.agents) {
            if (!next.tabs.some((t) => t.kind === "chat" && t.processId === agent.processId)) {
              next = openChatTab(next, agent.processId, agent.sessionName ?? "聊天");
            }
          }
          return next;
        }
        case "agent-closed":
          return closeChatTab(s, a.processId);
        case "rename-chat":
          return renameChatTab(s, a.processId, a.name);
      }
    },
    undefined,
    initialWorkspace,
  );
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
        dispatchToProcess("host", { type: "conn", state: s });
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
        if (evt.type === "agent-list") {
          const agents = (evt as { agents?: Array<{ processId: string; sessionName: string | null }> }).agents ?? [];
          setWorkspaceAgents(agents);
          return;
        }
        if (evt.type === "agent_closed") {
          const pid = typeof evt.processId === "string" ? evt.processId : "";
          if (pid) setWorkspaceAgentsClosed(pid);
          return;
        }
        const action = toAction(evt as PiEvent);
        if (!action) return;
        // R23 F5：高频流式事件（text_delta/thinking_delta/tool_update）包 transition，
        // 避免每 delta 同步渲染阻塞输入/滚动；消息边界保持同步
        if (isTransitionalAction(action)) {
          startTransition(() => dispatchToProcess("host", action));
        } else {
          dispatchToProcess("host", action);
        }
        // R26 session-follow：会话切换完成 → 列表/高亮/历史跟随（服务端 session_start 广播）
        if (evt.type === "session_switch_ready") {
          refreshSessions();
          loadHistory(true);
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

  // R26 session-follow：拉取当前会话历史（切换完成时 + 连接建立时共用；失败延迟重试一次）
  const loadHistory = useCallback((retry = true) => {
    rpcRef.current
      ?.request<{ messages: HistoryMessage[] }>("pi:chatHistory", { processId: "host" })
      .then((r) => dispatchToProcess("host", { type: "history", messages: r.messages ?? [] }))
      .catch(() => {
        if (retry) setTimeout(() => loadHistory(false), 400);
      });
  }, [dispatchToProcess]);

  // 连接建立后拉取初始数据
  useEffect(() => {
    if (conn !== "open" || !rpcRef.current) return;
    const c = rpcRef.current;
    c.request<WebState>("pi:getState")
      .then((st) => dispatchToProcess("host", { type: "state", state: st as unknown as Record<string, unknown> }))
      .catch((e) => toast.error(`getState: ${e.message}`));
    loadHistory(false);
    refreshSessions();
    c.request<ModelInfo[]>("pi:listModels").then(setModels).catch(() => undefined);
    // multi-instance：连接后拉取已注册进程（chat tab 列表）
    c.request<{ agents: Array<{ processId: string; sessionName: string | null }> }>("pi:agentList")
      .then((r) => setWorkspaceAgents(r.agents ?? []))
      .catch(() => undefined);
  }, [conn, refreshSessions, setWorkspaceAgents]);

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
  const answerAsk = useCallback((toolCallId: string, answer: unknown) => {
    rpcRef.current?.request("web-ask:answer", { toolCallId, answer }).catch((e) => {
      toast.error(`回答提交失败: ${e.message}`);
    });
  }, []);

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

  const switchSession = useCallback((path: string) => {
    const c = rpcRef.current;
    if (!c) return;
    c.request<{ cancelled: boolean }>("pi:switchSession", { path })
      .then((r) => {
        if (r.cancelled) toast.info("切换已取消");
        else toast.success("会话已切换");
      })
      .catch((e) => privilegedError(e, "切换会话"));
  }, [privilegedError]);

  const newSession = useCallback(() => {
    const c = rpcRef.current;
    if (!c) return;
    c.request<{ cancelled: boolean }>("pi:newSession")
      .then((r) => {
        if (r.cancelled) toast.info("新建已取消");
        else toast.success("已新建会话");
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
      onSelect: switchSession,
      onNew: newSession,
      onDelete: deleteSession,
      onRename: renameSession,
      onClone: clone,
      onShowTree: openTree,
      onRefresh: refreshSessions,
    }),
    [switchSession, newSession, deleteSession, renameSession, clone, openTree, refreshSessions],
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
            setPanel(p);
            // 打开文件面板且无文件 tab 时进入文件浏览态（主区空态提示）
            if (p === "files" && !workspace.tabs.some((t) => t.kind === "file")) {
              dispatchWs({ kind: "activate", id: "files" });
            }
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
                activePath={chatProcessOf(workspace.active) !== null || workspace.active === "files" ? null : workspace.active}
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
            sessionName={hostState.sessionName ?? "聊天"}
            onActivate={(id) => dispatchWs({ kind: "activate", id })}
            onClose={(id) => {
              if (chatProcessOf(id) === null && id !== "files" && tabDirty(workspace, id)) {
                setPendingClose(id);
              } else {
                dispatchWs({ kind: "close", id });
              }
            }}
            onSave={() => {
              const active = workspace.active;
              if (chatProcessOf(active) === null && active !== "files") void editorRefs.current[active]?.save();
            }}
          />
      {chatProcessOf(workspace.active) !== null ? (
        <div className="min-h-0 flex-1">
          <DisconnectBannerMemo conn={conn} />
          {/* 连接建立后才挂载 ChatTab（渲染期 getRequest 需要 rpc 就绪）——连接中主区空 */}
          {conn === "open" && workspace.tabs
            .filter((t) => t.kind === "chat")
            .map((t) => (
              <div key={t.processId} className={chatTabId(t.processId) === workspace.active ? "h-full" : "hidden"}>
                <ChatTab
                  processId={t.processId}
                  name={t.name}
                  request={getRequest()}
                  conn={conn}
                  skills={skills}
                  commands={commands}
                  files={files}
                  pickerLoading={pickerLoading}
                  onPickerOpen={refreshPicker}
                  onAnswerAsk={answerAsk}
                  onFork={fork}
                  onRegisterDispatch={registerDispatch}
                  onUnregisterDispatch={unregisterDispatch}
                  onStateChange={handleTabStateChange}
                />
              </div>
            ))}
        </div>
      ) : (
        <div className="min-h-0 flex-1">
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
          {(workspace.active === "files" || diffPathOf(workspace.active) !== null) && chatProcessOf(workspace.active) === null && !workspace.tabs.some((t) => (t.kind === "file" ? t.path === workspace.active : false)) && !workspace.tabs.some((t) => t.kind === "diff" && workspace.active === `diff:${t.path}`) && (
            <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
              从左侧选择文件打开
            </div>
          )}
        </div>
      )}
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
