/**
 * 多实例 chat tab（T5）：每进程一个 tab 实例。
 * - 内部 useReducer(streamReducer)——per-tab 状态隔离（input/滚动/流式互不干扰）
 * - 挂载时注册 dispatch 到 App 的进程分发表（事件按 processId 路由）
 * - 挂载时拉取该进程会话历史（pi:chatHistory）
 */
import { memo, useEffect, useReducer, useCallback } from "react";
import { initialState, streamReducer, type StreamAction, type StreamState } from "@/entities/chat/stream";
import type { ConnState, RpcClient } from "@/shared/api/rpc";
import { Chat } from "./Chat";
import { InputBar } from "@/features/input-bar/InputBar";
import type { CommandInfo, SkillInfo, FileGroup, HistoryMessage } from "@/entities/chat/types";

export interface ChatTabProps {
  /** 会话 id（session 文件路径）——tab 键与事件分发 key */
  sessionId: string;
  /** 初始会话名（tab 标题） */
  name: string;
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

  // 全局连接状态同步（conn 事件只分发激活 tab——非激活 tab 的 reducer 需同步，避免误显"等待连接"）
  useEffect(() => {
    dispatch({ type: "conn", state: conn });
  }, [conn]);

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
      request("pi:chatSend", { processId: "host", text, deliverAs: "steer" }).catch(() => undefined);
    },
    [request],
  );

  const abort = useCallback(() => {
    request("pi:chatAbort", { processId: "host" }).catch(() => undefined);
  }, [request]);

  // web 提问回答：本进程（单进程多会话——回答走宿主 registry）
  const answerAsk = useCallback(
    (toolCallId: string, answer: unknown) => {
      request("web-ask:answer", { toolCallId, answer, processId: "host" }).catch(() => undefined);
    },
    [request],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
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
