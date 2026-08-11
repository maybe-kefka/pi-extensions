/**
 * 多实例 chat tab（T5）：每进程一个 tab 实例。
 * - 内部 useReducer(streamReducer)——per-tab 状态隔离（input/滚动/流式互不干扰）
 * - 挂载时注册 dispatch 到 App 的进程分发表（事件按 processId 路由）
 * - 挂载时拉取该进程会话历史（pi:chatHistory——按 processId 读注册者会话文件）
 */
import { memo, useCallback, useEffect, useReducer, useRef } from "react";
import { initialState, streamReducer, type StreamAction, type StreamState } from "@/entities/chat/stream";
import type { ConnState, RpcClient } from "@/shared/api/rpc";
import { Chat } from "./Chat";
import { Button } from "@/shared/ui/button";
import { InputBar } from "@/features/input-bar/InputBar";
import type { CommandInfo, SkillInfo, FileGroup, HistoryMessage } from "@/entities/chat/types";

export interface ChatTabProps {
  /** 会话 id（session 文件路径）——tab 键与事件分发 key */
  sessionId: string;
  /** 初始会话名（tab 标题） */
  name: string;
  /** 服务该会话的注册进程（TUI 注册者 / spawn 实例）；空 = 无进程（禁用发送） */
  processId: string;
  /** 断线（实例已退出）——显示提示 + 重新拉起 */
  dead: boolean;
  /** 重新拉起（respawn 同会话实例） */
  onRevive: (sessionId: string) => void;
  /** 是否激活（激活才注册事件分发——进程当前会话 = 激活 tab 的会话） */
  active: boolean;
  request: RpcClient["request"];
  conn: ConnState;
  skills: SkillInfo[];
  commands: CommandInfo[];
  files: FileGroup[];
  pickerLoading: boolean;
  onPickerOpen: () => void;
  onFork: (userIndex: number) => void;
  /** 挂载/卸载时注册/注销 dispatch（App 事件分发用；key = sessionId） */
  onRegisterDispatch: (sessionId: string, dispatch: (a: StreamAction) => void) => void;
  onUnregisterDispatch: (sessionId: string) => void;
  /** 状态上报（App 只镜像激活 tab——会话元数据用） */
  onStateChange: (sessionId: string, state: StreamState) => void;
}

export const ChatTab = memo(function ChatTab({
  sessionId,
  name: _name,
  processId,
  dead,
  onRevive,
  active,
  request,
  conn,
  skills,
  commands,
  files,
  pickerLoading,
  onPickerOpen,
  onFork,
  onRegisterDispatch,
  onUnregisterDispatch,
  onStateChange,
}: ChatTabProps) {
  const [state, dispatch] = useReducer(streamReducer, initialState);
  /** 历史已加载标记（切回 tab 不重拉——reducer 状态 long-live） */
  const loadedRef = useRef(false);

  // 全局连接状态同步（conn 事件只分发激活 tab——非激活 tab 的 reducer 需同步，避免误显"等待连接"）
  useEffect(() => {
    dispatch({ type: "conn", state: conn });
  }, [conn]);

  // compact 后重拉历史（压缩摘要替换旧气泡）
  useEffect(() => {
    if (!active || state.sessionReason !== "compact" || !processId) return;
    request<{ messages: HistoryMessage[] }>("pi:chatHistory", { processId })
      .then((r) => dispatch({ type: "history", messages: r.messages ?? [] }))
      .catch(() => undefined);
  }, [state.sessionReason, active, processId, request]);

  // 历史加载（仅首次）：进程绑定（processId 非空）且未加载过才拉
  // ——切回已加载 tab 不重拉，reducer 状态直接显示（long-live）
  useEffect(() => {
    if (!active || loadedRef.current || !processId) return;
    loadedRef.current = true;
    let cancelled = false;
    request<{ messages: HistoryMessage[] }>("pi:chatHistory", { processId })
      .then((r) => {
        if (!cancelled) dispatch({ type: "history", messages: r.messages ?? [] });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [active, processId, request]);

  // 激活时注册分发器（进程当前会话 = 激活 tab——事件/历史按 sessionId 路由）
  useEffect(() => {
    if (active) {
      onRegisterDispatch(sessionId, dispatch);
      return () => onUnregisterDispatch(sessionId);
    }
  }, [active, sessionId, onRegisterDispatch, onUnregisterDispatch]);

  // 状态上报（App 镜像激活 tab——会话元数据用）
  useEffect(() => {
    if (active) onStateChange(sessionId, state);
  }, [active, sessionId, state, onStateChange]);

  const send = useCallback(
    (text: string) => {
      if (!processId) return;
      request("pi:chatSend", { processId, text, deliverAs: "steer" }).catch(() => undefined);
    },
    [request, processId],
  );

  const abort = useCallback(() => {
    if (!processId) return;
    request("pi:chatAbort", { processId }).catch(() => undefined);
  }, [request, processId]);

  // web 提问回答：按进程路由（TUI 注册者 / spawn 实例——经服务进程下行）
  const answerAsk = useCallback(
    (toolCallId: string, answer: unknown) => {
      if (!processId) return;
      request("web-ask:answer", { toolCallId, answer, processId }).catch(() => undefined);
    },
    [request, processId],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {dead && (
        <div className="bg-muted/60 flex items-center justify-between gap-2 border-b px-3 py-1.5 text-xs">
          <span className="text-muted-foreground">实例已退出——会话内容保留在磁盘</span>
          <Button size="sm" variant="outline" className="h-6 cursor-pointer text-xs" onClick={() => onRevive(sessionId)}>
            重新拉起
          </Button>
        </div>
      )}
      <Chat state={state} dispatch={dispatch} onFork={onFork} onAnswerAsk={answerAsk} />
      <InputBar
        busy={state.streaming}
        queue={state.queue}
        conn={conn}
        skills={skills}
        commands={commands}
        files={files}
        pickerLoading={pickerLoading}
        onSend={send}
        onAbort={abort}
        onPickerOpen={onPickerOpen}
      />
    </div>
  );
});
