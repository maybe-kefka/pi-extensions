/**
 * 多实例 chat tab（T5）：每进程一个 tab 实例。
 * - 内部 useReducer(streamReducer)——per-tab 状态隔离（input/滚动/流式互不干扰）
 * - 挂载时注册 dispatch 到 App 的进程分发表（事件按 processId 路由）
 * - 挂载时拉取该进程会话历史（pi:chatHistory——按 processId 读注册者会话文件）
 */
import { memo, useCallback, useEffect, useReducer, useRef } from "react";
import { initialState, pickStreamMeta, streamReducer, type StreamAction, type StreamState, type StreamStateMeta } from "@/entities/chat";
import type { ConnState, RpcClient } from "@/shared/api";
import { Chat } from "@/features/chat-stream";
import { Button } from "@/shared/ui";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui";
import { ContextPanel } from "@/features/context";
import { WaterCup } from "@/features/chat-stream";
import { InputBar } from "@/features/input-bar";
import type { CommandInfo, SkillInfo, FileGroup, HistoryMessage } from "@/entities/chat";

export interface ChatTabProps {
  /** 会话 id（session 文件路径）——tab 键与事件分发 key */
  sessionId: string;
  /** 初始会话名（tab 标题） */
  name: string;
  /** 服务该会话的注册进程（TUI 注册者 / spawn 实例）；空 = 无进程（禁用发送） */
  processId: string;
  /** 断线（实例已退出）——显示提示 + 重新拉起 */
  dead: boolean;
  /** 该会话实例的 context usage（水杯水位 + 详情） */
  usage: { percent: number | null; tokens: number | null; contextWindow: number | null } | null;
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
  /** input 草稿恢复/上报（split 重挂后不丢） */
  draftText?: string;
  onDraftChange?: (text: string) => void;
  /** 状态快照恢复：重挂时用上次快照初始化 reducer（split 跨父重挂后消息内容不丢、不重拉历史） */
  savedState?: StreamState;
  onStateSave?: (sessionId: string, state: StreamState) => void;
  /** R27：滚动位置（split 重挂后恢复）——上次 scrollTop 比例 0-1；null = 无 */
  scrollAnchor?: number | null;
  onScrollAnchorSave?: (sessionId: string, anchor: number | null) => void;
  /** 挂载/卸载时注册/注销 dispatch（App 事件分发用；key = sessionId） */
  onRegisterDispatch: (sessionId: string, dispatch: (a: StreamAction) => void) => void;
  onUnregisterDispatch: (sessionId: string) => void;
  /** 状态上报（App 只镜像激活 tab——会话元数据用） */
  /** 会话元数据上报（元数据子集——完整 stream state 高频变化不得上抛） */
  onStateChange: (sessionId: string, meta: StreamStateMeta) => void;
}

export const ChatTab = memo(function ChatTab({
  sessionId,
  name: _name,
  processId,
  dead,
  usage,
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
  draftText,
  onDraftChange,
  savedState,
  onStateSave,
  scrollAnchor,
  onScrollAnchorSave,
  onRegisterDispatch,
  onUnregisterDispatch,
  onStateChange,
}: ChatTabProps) {
  const [state, dispatch] = useReducer(streamReducer, savedState ?? initialState);
  /** 历史已加载标记（切回 tab 不重拉——reducer 状态 long-live）；有快照恢复 → 视为已加载（不重拉） */
  const loadedRef = useRef(!!savedState);
  /** 最新 state 快照（卸载时上报 App——跨父重挂后恢复） */
  const stateRef = useRef(state);
  stateRef.current = state;
  useEffect(() => {
    return () => onStateSave?.(sessionId, stateRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, onStateSave]);

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

  // 挂载即注册分发器（事件按 sessionId 路由——后台 tab 流式事件不丢；同会话单 tab 无冲突）
  useEffect(() => {
    onRegisterDispatch(sessionId, dispatch);
    return () => onUnregisterDispatch(sessionId);
  }, [sessionId, onRegisterDispatch, onUnregisterDispatch]);


  // 状态上报（App 镜像激活 tab——会话元数据用）
  useEffect(() => {
    if (active) onStateChange(sessionId, pickStreamMeta(state));
  }, [active, sessionId, state, onStateChange]);

  const send = useCallback(
    (text: string) => {
      if (!processId) return;
      request("pi:chatSend", { processId, text, deliverAs: "steer" }).catch(() => undefined);
    },
    [request, processId],
  );

  // 稳定 getRequest（ContextPanel effect 依赖——防渲染循环）
  const getRequestStable = useCallback(() => request, [request]);

  // 压缩：按进程路由（实例下行 compact；无进程 → 服务进程本地）
  const compact = useCallback(() => {
    request("pi:compact", processId ? { processId } : {}).catch(() => undefined);
  }, [request, processId]);

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
      <Chat
        state={state}
        dispatch={dispatch}
        onFork={onFork}
        onAnswerAsk={answerAsk}
        scrollAnchor={scrollAnchor}
        onScrollAnchorChange={(anchor) => onScrollAnchorSave?.(sessionId, anchor)}
      />
      <div className="flex items-start gap-2 border-t px-3">
        {/* 水杯进度条：per-tab 实例 context 占用；点击查看详情 */}
        <Popover>
          <PopoverTrigger asChild>
            <button className="mt-3 cursor-pointer" title="上下文占用（点击查看详情）">
              <WaterCup percent={usage?.percent ?? null} />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" side="top" className="mb-2">
            <ContextPanel getRequest={getRequestStable} onCompact={compact} processId={processId} />
          </PopoverContent>
        </Popover>
        <div className="min-w-0 flex-1">
          <InputBar
            bordered={false}
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
            draftText={draftText}
            onDraftChange={onDraftChange}
          />
        </div>
      </div>
    </div>
  );
});
