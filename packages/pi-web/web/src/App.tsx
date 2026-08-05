import { memo, useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { toast } from "sonner";
import { createRpcClient, type RpcClient } from "@/lib/rpc";
import { initialState, streamReducer, type StreamAction } from "@/lib/stream";
import type { CommandInfo, FileGroup, ModelInfo, PiEvent, SessionInfo, SkillInfo, TreeNode, WebState } from "@/lib/types";
import { Header } from "@/components/Header";
import { Chat } from "@/components/Chat";
import { Sidebar, SidebarSheet, type SidebarContentProps } from "@/components/Sidebar";
import { InputBar } from "@/components/InputBar";
import { DisconnectBanner } from "@/components/DisconnectBanner";
import { TreeDialog } from "@/components/TreeDialog";

/** 服务器 pi:event → reducer action（薄映射） */
function toAction(evt: PiEvent): StreamAction | null {
  switch (evt.type) {
    case "message_start":
      return { type: "message_start", message: (evt.message ?? {}) as { role?: string; content?: unknown } };
    case "message_update":
      return { type: "message_update", event: (evt.event ?? {}) as { type?: string; delta?: string; partial?: { thinking?: string } } };
    case "message_end":
      return { type: "message_end", message: (evt.message ?? {}) as { role?: string; content?: unknown } };
    case "tool_execution_start":
      return { type: "tool_start", toolCallId: String(evt.toolCallId), toolName: String(evt.toolName), args: evt.args };
    case "tool_execution_update":
      return { type: "tool_update", toolCallId: String(evt.toolCallId), partialResult: (evt.partialResult as { content?: unknown } | null) ?? null };
    case "tool_execution_end":
      return { type: "tool_end", toolCallId: String(evt.toolCallId), result: (evt.result as { content?: unknown } | null) ?? null, isError: evt.isError === true };
    case "turn_start":
      return { type: "turn_start" };
    case "turn_end":
      return { type: "turn_end" };
    case "agent_start":
      return { type: "agent_start" };
    case "agent_end":
      return { type: "agent_end", willRetry: evt.willRetry === true };
    case "agent_settled":
      return { type: "agent_settled" };
    case "queue_update":
      return { type: "queue_update", steering: (evt.steering as string[]) ?? [], followUp: (evt.followUp as string[]) ?? [] };
    case "state":
      return { type: "state", state: evt as Record<string, unknown> };
    case "session_start":
      return { type: "session_start", reason: evt.reason as string | undefined };
    case "session_shutdown":
      return { type: "session_shutdown", reason: evt.reason as string | undefined };
    case "session_before_switch":
      return { type: "session_before_switch", reason: evt.reason as string | undefined };
    case "session_switch_ready":
      return { type: "session_switch_ready" };
    case "notify":
      return { type: "notify", message: String(evt.message ?? ""), notifyType: String(evt.notifyType ?? "info") };
    case "setStatus":
      return { type: "setStatus", statusKey: String(evt.statusKey ?? ""), statusText: evt.statusText == null ? null : String(evt.statusText) };
    case "setWidget":
      return { type: "setWidget", widgetKey: String(evt.widgetKey ?? ""), widgetLines: Array.isArray(evt.widgetLines) ? (evt.widgetLines as string[]) : null };
    default:
      return null;
  }
}

const SidebarMemo = memo(Sidebar);
const SidebarSheetMemo = memo(SidebarSheet);
const InputBarMemo = memo(InputBar);
const DisconnectBannerMemo = memo(DisconnectBanner);

/** 特权能力失效判定（后端 code 1 + 会话控制文案） */
function isPrivilegedError(e: Error): boolean {
  return e.message.includes("会话控制能力");
}

export default function App() {
  const [state, dispatch] = useReducer(streamReducer, initialState);
  const [conn, setConn] = useState(initialState.conn);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [files, setFiles] = useState<FileGroup[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [treeOpen, setTreeOpen] = useState(false);
  const [tree, setTree] = useState<TreeNode[] | null>(null);
  const [leafId, setLeafId] = useState<string | null>(null);
  const [treeLoading, setTreeLoading] = useState(false);
  const [degraded, setDegraded] = useState(false);
  const rpcRef = useRef<RpcClient | null>(null);
  const [booted, setBooted] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

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
        dispatch({ type: "conn", state: s });
      },
      onEvent: (evt) => {
        const action = toAction(evt as PiEvent);
        if (action) dispatch(action);
      },
    });
    rpcRef.current = client;
    client.connect();
    setBooted(true);
    return () => client.disconnect();
  }, []);

  const refreshSessions = useCallback(() => {
    rpcRef.current?.request<SessionInfo[]>("pi:listSessions").then(setSessions).catch(() => undefined);
  }, []);

  // 连接建立后拉取初始数据
  useEffect(() => {
    if (conn !== "open" || !rpcRef.current) return;
    const c = rpcRef.current;
    c.request<WebState>("pi:getState")
      .then((st) => dispatch({ type: "state", state: st as unknown as Record<string, unknown> }))
      .catch((e) => toast.error(`getState: ${e.message}`));
    c.request<{ messages: { role: string; text: string; thinking?: string; toolCalls?: { id: string; name: string; arguments: unknown; result?: string; isError?: boolean }[]; userIndex?: number }[] }>("pi:getMessages")
      .then((r) => dispatch({ type: "history", messages: r.messages ?? [] }))
      .catch(() => undefined);
    refreshSessions();
    c.request<ModelInfo[]>("pi:listModels").then(setModels).catch(() => undefined);
  }, [conn, refreshSessions]);

  // "+" 弹层数据（懒加载：打开时刷新）
  const refreshPicker = useCallback(() => {
    const c = rpcRef.current;
    if (!c || conn !== "open") return;
    setPickerLoading(true);
    Promise.all([
      c.request<SkillInfo[]>("pi:listSkills").catch(() => [] as SkillInfo[]),
      c.request<FileGroup[]>("pi:listFiles").catch(() => [] as FileGroup[]),
    ])
      .then(([sk, fl]) => {
        setSkills(sk);
        setFiles(fl);
      })
      .finally(() => setPickerLoading(false));
  }, [conn]);

  const send = useCallback((text: string, deliverAs?: "steer" | "followUp") => {
    const c = rpcRef.current;
    if (!c) return;
    c.request("pi:sendMessage", { text, ...(deliverAs ? { deliverAs } : {}) }).catch((e) => {
      toast.error(`发送失败: ${e.message}`);
    });
  }, []);

  const abort = useCallback(() => {
    rpcRef.current?.request("pi:abort").catch((e) => toast.error(`abort: ${e.message}`));
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

  const sidebarProps = useMemo<SidebarContentProps>(
    () => ({
      sessions,
      currentSessionFile: state.sessionFile,
      models,
      currentModel: state.model ? `${state.model.provider}/${state.model.id}` : null,
      thinkingLevel: state.thinkingLevel,
      thinkingLevels: state.availableThinkingLevels,
      bridge: state.bridge,
      sessionDegraded: degraded,
      sessionActions,
      onSetModel: setModel,
      onSetThinking: setThinking,
    }),
    [sessions, state.sessionFile, state.model, state.thinkingLevel, state.availableThinkingLevels, state.bridge, models, degraded, sessionActions, setModel, setThinking],
  );

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <Header
        conn={conn}
        state={state}
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={() => setSidebarCollapsed((c) => !c)}
        onOpenDrawer={() => setDrawerOpen(true)}
        onCompact={compact}
        getRequest={getRequest}
      />
      <DisconnectBannerMemo conn={conn} />
      <div className="flex min-h-0 flex-1">
        <Chat state={state} dispatch={dispatch} onFork={fork} />
        <SidebarMemo collapsed={sidebarCollapsed} {...sidebarProps} />
      </div>
      <SidebarSheetMemo open={drawerOpen} onOpenChange={setDrawerOpen} {...sidebarProps} />
      <InputBarMemo
        busy={state.streaming}
        queue={state.queue}
        conn={conn}
        skills={skills}
        files={files}
        pickerLoading={pickerLoading}
        onSend={send}
        onAbort={abort}
        onPickerOpen={refreshPicker}
      />
      <TreeDialog
        open={treeOpen}
        onOpenChange={setTreeOpen}
        tree={tree}
        loading={treeLoading}
        currentLeafId={leafId}
        navigable={!degraded}
        onNavigate={navigateTree}
      />
    </div>
  );
}
