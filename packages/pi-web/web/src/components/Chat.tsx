import { useMemo, useState } from "react";
import type * as React from "react";
import { Bot, CircleCheck, CircleX, GitFork, Loader2, User, Wrench } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Markdown } from "@/components/ui/markdown";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Marker, MarkerContent } from "@/components/ui/marker";
import { Message, MessageAvatar, MessageContent, MessageGroup, MessageHeader } from "@/components/ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  bubbleStreaming,
  bubbleToolCallIds,
  type StreamAction,
  type StreamState,
  type Turn,
  type TurnBubble,
} from "@/lib/stream";

function BotAvatar() {
  return (
    <Avatar className="size-7 sm:size-8">
      <AvatarFallback className="bg-muted text-foreground">
        <Bot className="size-4" />
      </AvatarFallback>
    </Avatar>
  );
}

function UserAvatar() {
  return (
    <Avatar className="size-7 sm:size-8">
      <AvatarFallback className="bg-muted text-foreground">
        <User className="size-4" />
      </AvatarFallback>
    </Avatar>
  );
}

type ToolStatus = "running" | "done" | "error";

function toolStatus(row: StreamState["tools"][number]): ToolStatus {
  if (!row.final) return "running";
  return row.isError ? "error" : "done";
}

function StatusIcon({ status }: { status: ToolStatus }) {
  if (status === "running") return <Loader2 className="text-muted-foreground size-3.5 animate-spin" />;
  if (status === "error") return <CircleX className="text-destructive size-3.5" />;
  return <CircleCheck className="text-success size-3.5" />;
}

const STATUS_LABEL: Record<ToolStatus, { text: string; variant: "secondary" | "default" | "destructive" }> = {
  running: { text: "运行中", variant: "secondary" },
  done: { text: "完成", variant: "default" },
  error: { text: "失败", variant: "destructive" },
};

/** 单个工具详情卡片（点击弹窗，气泡内联与时间线弹窗复用） */
function ToolCard({ row }: { row: StreamState["tools"][number] }) {
  const [open, setOpen] = useState(false);
  const status = toolStatus(row);
  const preview =
    row.output.trim() || (row.args === null || row.args === undefined ? "" : JSON.stringify(row.args));
  const label = STATUS_LABEL[status];

  return (
    <>
      <Button
        variant="outline"
        className="flex h-auto w-full cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-left text-xs"
        onClick={() => setOpen(true)}
      >
        <StatusIcon status={status} />
        <span className="shrink-0 font-medium">{row.toolName}</span>
        {preview && <span className="text-muted-foreground min-w-0 flex-1 truncate">{preview}</span>}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <span>⚙ {row.toolName}</span>
              <Badge variant={label.variant}>{label.text}</Badge>
            </DialogTitle>
            <DialogDescription className="font-mono text-[11px]">{row.toolCallId}</DialogDescription>
          </DialogHeader>
          {row.args !== null && row.args !== undefined && (
            <div className="min-w-0">
              <div className="text-muted-foreground mb-1 text-xs">参数</div>
              <pre className="bg-muted/50 border-border max-h-40 overflow-y-auto rounded-md border p-2 text-xs whitespace-pre-wrap [overflow-wrap:anywhere]">
                {JSON.stringify(row.args, null, 2)}
              </pre>
            </div>
          )}
          <div className="min-w-0">
            <div className="text-muted-foreground mb-1 text-xs">输出</div>
            <pre className="bg-muted/50 border-border max-h-96 overflow-y-auto rounded-md border p-2 text-xs whitespace-pre-wrap [overflow-wrap:anywhere]">
              {row.output || "(空)"}
            </pre>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * 流式过程行（R17 极简）：本轮未 final 时——Thinking… 行（不展开）+ 工具名行（状态图标 + 工具名）。
 * final 后不渲染（气泡只留最终文本，完整记录在时间线弹窗）。
 */
function StreamingProgress({
  turn,
  tools,
}: {
  turn: Turn;
  tools: StreamState["tools"];
}) {
  // turn 已声明的工具 + 全局正在执行（未 final）的工具行（toolCallIds 流式中为空，靠 tool_start 事件补全）
  const rows: StreamState["tools"][number][] = [
    ...turn.toolCallIds
      .map((id) => tools.find((t) => t.toolCallId === id))
      .filter((t): t is StreamState["tools"][number] => t !== undefined),
    ...tools.filter((t) => !t.final && !turn.toolCallIds.includes(t.toolCallId)),
  ];
  return (
    <div className="flex flex-col gap-1" data-slot="streaming-progress">
      {turn.thinking.trim().length > 0 && (
        <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <Loader2 className="size-3 animate-spin" /> Thinking…
        </div>
      )}
      {rows.map((row) => (
        <div key={row.toolCallId} className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <StatusIcon status={toolStatus(row)} />
          <span className="truncate font-medium">{row.toolName}</span>
        </div>
      ))}
    </div>
  );
}

/** 时间线弹窗：按 turn 顺序交错展示 thinking 全文 + 工具卡片（不含最终正文） */
function TimelineDialog({
  bubble,
  tools,
  open,
  onOpenChange,
}: {
  bubble: TurnBubble;
  tools: StreamState["tools"];
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const entries = useMemo(() => {
    const out: { kind: "thinking" | "tool"; turnIndex: number; thinking?: string; toolRow?: StreamState["tools"][number] }[] = [];
    bubble.turns.forEach((turn, ti) => {
      if (turn.thinking.trim()) {
        out.push({ kind: "thinking", turnIndex: ti, thinking: turn.thinking });
      }
      for (const id of turn.toolCallIds) {
        const row = tools.find((t) => t.toolCallId === id);
        if (row) out.push({ kind: "tool", turnIndex: ti, toolRow: row });
      }
    });
    return out;
  }, [bubble, tools]);
  const toolCount = bubbleToolCallIds(bubble).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-base">⏱ 执行流程</DialogTitle>
          <DialogDescription>
            本轮完整 reasoning + Action 流程（{bubble.turns.length} 轮 · {toolCount} 次工具调用）
          </DialogDescription>
        </DialogHeader>
        <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto">
          {entries.length === 0 && <div className="text-muted-foreground p-2 text-xs">（本气泡无思考与工具记录）</div>}
          {entries.map((e, i) =>
            e.kind === "thinking" ? (
              <div key={i} className="flex flex-col gap-1">
                <span className="text-muted-foreground text-xs">第 {e.turnIndex + 1} 轮 · 思考</span>
                <pre className="bg-muted/50 border-border max-h-56 overflow-y-auto rounded-md border p-2 text-xs whitespace-pre-wrap [overflow-wrap:anywhere]">
                  {e.thinking}
                </pre>
              </div>
            ) : (
              <div key={i} className="flex flex-col gap-1">
                <span className="text-muted-foreground text-xs">第 {e.turnIndex + 1} 轮 · 工具</span>
                {e.toolRow && <ToolCard row={e.toolRow} />}
              </div>
            ),
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** 轮次聚合气泡（SPEC §7）：user 消息开气泡，后续 assistant turns 聚合 */
function TurnBubbleView({
  bubble,
  tools,
  agentStreaming,
  onFork,
}: {
  bubble: TurnBubble;
  tools: StreamState["tools"];
  agentStreaming: boolean;
  onFork: (userIndex: number) => void;
}) {
  const [timelineOpen, setTimelineOpen] = useState(false);
  const hasUser = bubble.userIndex >= 0;
  const streaming = bubbleStreaming(bubble);
  // 工具栏：轮结束后出现（气泡内无活跃 turn 且 agent 空闲、有 user 消息）
  const showToolbar = hasUser && !streaming && !agentStreaming;

  return (
    <>
      {hasUser && (
        <Message align="end">
          <MessageAvatar>
            <UserAvatar />
          </MessageAvatar>
          <MessageContent>
            <Bubble variant="default" align="end">
              <BubbleContent>
                {bubble.userFinal && bubble.userText.trim() ? (
                  <span className="wrap-break-word whitespace-pre-wrap">{bubble.userText}</span>
                ) : (
                  <>
                    <span className="wrap-break-word whitespace-pre-wrap">{bubble.userText}</span>
                    {!bubble.userText && <span className="animate-pulse">▍</span>}
                  </>
                )}
              </BubbleContent>
            </Bubble>
          </MessageContent>
        </Message>
      )}
      {bubble.turns.length > 0 && (
        <Message align="start">
          <MessageAvatar>
            <BotAvatar />
          </MessageAvatar>
          <MessageContent>
            <Bubble variant="outline" className="w-full">
              {bubble.turns.map((turn, i) => {
                const isLast = i === bubble.turns.length - 1;
                // 空 turn（无正文且非流式中）不渲染——纯工具/纯 thinking turn 的正文为空，避免"只有分隔线的空白行"
                const hasVisible = turn.text.trim().length > 0 || (isLast && !turn.final);
                if (!hasVisible) return null;
                return (
                  <div key={i} className={i > 0 ? "mt-2 border-t pt-2" : ""}>
                    <div className="flex flex-col gap-1.5">
                      {/* R17：过程信息（Thinking…/工具名行）只在流式中显示，final 后消失 */}
                      {!turn.final && <StreamingProgress turn={turn} tools={tools} />}
                      {turn.text.trim() ? (
                        isLast && !turn.final ? (
                          <span className="wrap-break-word whitespace-pre-wrap">
                            {turn.text}
                            <span className="animate-pulse">▍</span>
                          </span>
                        ) : (
                          <Markdown text={turn.text} />
                        )
                      ) : isLast && !turn.final ? (
                        <span className="animate-pulse">▍</span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
              {streaming && bubble.turns.length === 0 && (
                <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" /> Thinking…
                </div>
              )}
            </Bubble>
            {showToolbar && (
              <div className="flex items-center gap-1 pt-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground h-6 cursor-pointer px-2 text-[11px]"
                      onClick={() => onFork(bubble.userIndex)}
                    >
                      <GitFork data-icon="inline-start" className="size-3" />
                      fork
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>从此轮分叉新会话</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground h-6 cursor-pointer px-2 text-[11px]"
                      onClick={() => setTimelineOpen(true)}
                    >
                      {streaming ? (
                        <>
                          <Loader2 className="size-3 animate-spin" data-icon="inline-start" />
                          进行中
                        </>
                      ) : (
                        <>
                          <Wrench data-icon="inline-start" className="size-3" />
                          progress
                        </>
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>查看完整 reasoning + Action 流程</TooltipContent>
                </Tooltip>
              </div>
            )}
          </MessageContent>
        </Message>
      )}

      <TimelineDialog bubble={bubble} tools={tools} open={timelineOpen} onOpenChange={setTimelineOpen} />
    </>
  );
}

export function Chat({
  state,
  dispatch,
  onFork,
}: {
  state: StreamState;
  dispatch: React.Dispatch<StreamAction>;
  onFork: (userIndex: number) => void;
}) {
  const hasContent = state.bubbles.length > 0 || state.tools.length > 0;

  return (
    <main className="relative min-w-0 flex-1">
      <MessageScrollerProvider autoScroll>
        <MessageScroller className="min-h-0 flex-1">
          <MessageScrollerViewport>
            <MessageScrollerContent className="mx-auto w-full max-w-3xl gap-3 px-4 py-3">
              {!hasContent ? (
                <Empty className="mt-16">
                  <EmptyHeader>
                    <EmptyTitle className="text-sm font-medium">暂无消息</EmptyTitle>
                    <EmptyDescription>
                      {state.conn === "open" ? "发送第一条消息开始" : "等待连接…"}
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <>
                  {state.bubbles.map((b) => (
                    <MessageScrollerItem
                      key={b.id}
                      messageId={b.id}
                      scrollAnchor={b.userIndex >= 0}
                    >
                      <MessageGroup>
                        <TurnBubbleView
                          bubble={b}
                          tools={state.tools}
                          agentStreaming={state.streaming}
                          onFork={onFork}
                        />
                      </MessageGroup>
                    </MessageScrollerItem>
                  ))}
                </>
              )}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton />
        </MessageScroller>
      </MessageScrollerProvider>
    </main>
  );
}
