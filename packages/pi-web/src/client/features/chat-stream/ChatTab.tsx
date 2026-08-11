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
  processId: string;
  /** 初始会话名（tab 标题） */
  name: string;
  request: RpcClient["request"];
  conn: ConnState;
  skills: SkillInfo[];
  commands: CommandInfo[];
  files: FileGroup[];
  pickerLoading: boolean;
  onPickerOpen: () => void;
  onAnswerAsk: (toolCallId: string, answer: unknown) => void;
  onFork: (userIndex: number) => void;
  /** 挂载/卸载时注册/注销 dispatch（App 事件分发用） */
  onRegisterDispatch: (processId: string, dispatch: (a: StreamAction) => void) => void;
  onUnregisterDispatch: (processId: string) => void;
  /** 状态上报（App 只镜像 host——会话元数据用） */
  onStateChange: (processId: string, state: StreamState) => void;
}

export const ChatTab = memo(function ChatTab({
  processId,
  name: _name,
  request,
  conn,
  skills,
  commands,
  files,
  pickerLoading,
  onPickerOpen,
  onAnswerAsk,
  onFork,
  onRegisterDispatch,
  onUnregisterDispatch,
  onStateChange,
}: ChatTabProps) {
  const [state, dispatch] = useReducer(streamReducer, initialState);

  // 注册分发器（事件路由）——每次 dispatch 引用变化都同步（reducer 返回的 dispatch 稳定）
  useEffect(() => {
    onRegisterDispatch(processId, dispatch);
    return () => onUnregisterDispatch(processId);
  }, [processId, onRegisterDispatch, onUnregisterDispatch]);

  // 状态上报（host 镜像——低频字段；流式高频由 reducer 内部消化）
  useEffect(() => {
    onStateChange(processId, state);
  }, [processId, state, onStateChange]);

  // 拉取该进程会话历史（一次）
  useEffect(() => {
    let cancelled = false;
    request<{ messages: HistoryMessage[] }>("pi:chatHistory", { processId })
      .then((r) => {
        if (!cancelled) dispatch({ type: "history", messages: r.messages ?? [] });
      })
      .catch(() => {
        /* 无历史（新会话）静默 */
      });
    return () => {
      cancelled = true;
    };
  }, [processId, request]);

  const send = useCallback(
    (text: string) => {
      request("pi:chatSend", { processId, text, deliverAs: "steer" }).catch((e: Error) => {
        /* 错误由 toast 层提示——InputBar 侧 */
      });
    },
    [processId, request],
  );

  const abort = useCallback(() => {
    request("pi:chatAbort", { processId }).catch(() => undefined);
  }, [processId, request]);

  // web 提问回答：路由到本进程（host 本地 registry / spawned 经 WS 下行）
  const answerAsk = useCallback(
    (toolCallId: string, answer: unknown) => {
      request("web-ask:answer", { toolCallId, answer, processId }).catch(() => undefined);
    },
    [processId, request],
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
