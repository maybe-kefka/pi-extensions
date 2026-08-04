import { useEffect, useReducer, useRef, useState } from "react";
import { toast } from "sonner";
import { createRpcClient, type RpcClient } from "@/lib/rpc";
import { initialState, streamReducer, type StreamAction } from "@/lib/stream";
import type { CommandInfo, ModelInfo, PiEvent, SessionInfo, WebState } from "@/lib/types";
import { Header } from "@/components/Header";
import { Chat } from "@/components/Chat";
import { Sidebar, SidebarSheet, type SidebarContentProps } from "@/components/Sidebar";
import { InputBar } from "@/components/InputBar";
import { DisconnectBanner } from "@/components/DisconnectBanner";

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

export default function App() {
  const [state, dispatch] = useReducer(streamReducer, initialState);
  const [conn, setConn] = useState(initialState.conn);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [commands, setCommands] = useState<CommandInfo[]>([]);
  const rpcRef = useRef<RpcClient | null>(null);
  const [booted, setBooted] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

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

  // 连接建立后拉取初始数据
  useEffect(() => {
    if (conn !== "open" || !rpcRef.current) return;
    const c = rpcRef.current;
    c.request<WebState>("pi:getState")
      .then((st) => dispatch({ type: "state", state: st as unknown as Record<string, unknown> }))
      .catch((e) => toast.error(`getState: ${e.message}`));
    c.request<{ messages: { role: string; text: string }[] }>("pi:getMessages")
      .then((r) => dispatch({ type: "history", messages: r.messages ?? [] }))
      .catch(() => undefined);
    c.request<SessionInfo[]>("pi:listSessions").then(setSessions).catch(() => undefined);
    c.request<ModelInfo[]>("pi:listModels").then(setModels).catch(() => undefined);
    c.request<CommandInfo[]>("pi:listCommands").then(setCommands).catch(() => undefined);
  }, [conn]);

  const send = (text: string, deliverAs?: "steer" | "followUp") => {
    const c = rpcRef.current;
    if (!c) return;
    c.request("pi:sendMessage", { text, ...(deliverAs ? { deliverAs } : {}) }).catch((e) => {
      toast.error(`发送失败: ${e.message}`);
    });
  };

  const abort = () => {
    rpcRef.current?.request("pi:abort").catch((e) => toast.error(`abort: ${e.message}`));
  };

  const setModel = (provider: string, modelId: string) => {
    rpcRef.current?.request("pi:setModel", { provider, modelId }).then(() => {
      toast.success(`已切换 ${provider}/${modelId}`);
    }).catch((e) => toast.error(`setModel: ${e.message}`));
  };

  const setThinking = (level: string) => {
    rpcRef.current?.request("pi:setThinkingLevel", { level }).catch((e) => toast.error(`setThinkingLevel: ${e.message}`));
  };

  const sidebarProps: SidebarContentProps = {
    sessions,
    currentSessionFile: state.sessionFile,
    models,
    currentModel: state.model ? `${state.model.provider}/${state.model.id}` : null,
    thinkingLevel: state.thinkingLevel,
    commands,
    bridge: state.bridge,
    onSetModel: setModel,
    onSetThinking: setThinking,
  };

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <Header
        conn={conn}
        state={state}
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={() => setSidebarCollapsed((c) => !c)}
        onOpenDrawer={() => setDrawerOpen(true)}
      />
      <DisconnectBanner conn={conn} />
      <div className="flex min-h-0 flex-1">
        <Chat state={state} dispatch={dispatch} />
        <Sidebar collapsed={sidebarCollapsed} {...sidebarProps} />
      </div>
      <SidebarSheet open={drawerOpen} onOpenChange={setDrawerOpen} {...sidebarProps} />
      <InputBar busy={state.streaming} queue={state.queue} conn={conn} onSend={send} onAbort={abort} />
    </div>
  );
}
