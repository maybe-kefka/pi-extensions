import { useState } from "react";
import type * as React from "react";
import { Bot, Brain, CircleCheck, CircleX, GitFork, Loader2, User, Wrench } from "lucide-react";
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
  bubbleThinking,
  bubbleToolCallIds,
  type StreamAction,
  type StreamState,
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

/** 单个工具详情卡片（点击弹窗） */
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
  const [detail, setDetail] = useState<"reasoning" | "tools" | null>(null);
  const hasUser = bubble.userIndex >= 0;
  const hasThinking = bubbleThinking(bubble).trim().length > 0;
  const toolIds = bubbleToolCallIds(bubble);
  const toolRows = toolIds
    .map((id) => tools.find((t) => t.toolCallId === id))
    .filter((t): t is StreamState["tools"][number] => t !== undefined);
  const hasTools = toolIds.length > 0;
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
                const last = i === bubble.turns.length - 1;
                return (
                  <div key={i} className={i > 0 ? "mt-2 border-t pt-2" : ""}>
                    {turn.text.trim() ? (
                      last && !turn.final ? (
                        <span className="wrap-break-word whitespace-pre-wrap">
                          {turn.text}
                          {!turn.text && <span className="animate-pulse">▍</span>}
                          {turn.text && <span className="animate-pulse">▍</span>}
                        </span>
                      ) : (
                        <Markdown text={turn.text} />
                      )
                    ) : last && !turn.final ? (
                      <span className="animate-pulse">▍</span>
                    ) : null}
                  </div>
                );
              })}
            </Bubble>
            {showToolbar && (
              <div className="flex items-center gap-1 pt-1">
                {hasUser && (
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
                )}
                {hasThinking && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground h-6 cursor-pointer px-2 text-[11px]"
                    onClick={() => setDetail("reasoning")}
                  >
                    <Brain data-icon="inline-start" className="size-3" />
                    reasoning
                  </Button>
                )}
                {hasTools && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground h-6 cursor-pointer px-2 text-[11px]"
                    onClick={() => setDetail("tools")}
                  >
                    <Wrench data-icon="inline-start" className="size-3" />
                    tools
                  </Button>
                )}
              </div>
            )}
          </MessageContent>
        </Message>
      )}

      <Dialog open={detail === "reasoning"} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-base">🧠 Reasoning</DialogTitle>
            <DialogDescription>本轮完整思考过程</DialogDescription>
          </DialogHeader>
          <pre className="bg-muted/50 border-border max-h-[60vh] overflow-y-auto rounded-md border p-3 text-xs whitespace-pre-wrap [overflow-wrap:anywhere]">
            {bubbleThinking(bubble)}
          </pre>
        </DialogContent>
      </Dialog>

      <Dialog open={detail === "tools"} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-base">⚙ 工具调用（{toolRows.length}）</DialogTitle>
            <DialogDescription>本轮全部工具执行详情</DialogDescription>
          </DialogHeader>
          <div className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto">
            {toolRows.map((row) => (
              <ToolCard key={row.toolCallId} row={row} />
            ))}
            {toolRows.length === 0 && <div className="text-muted-foreground text-xs">（工具执行记录尚未到达）</div>}
          </div>
        </DialogContent>
      </Dialog>
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
  const queueText =
    state.queue.steering.length > 0 || state.queue.followUp.length > 0
      ? `队列: ${state.queue.steering.length ? `steer×${state.queue.steering.length}` : ""}${state.queue.steering.length && state.queue.followUp.length ? " " : ""}${state.queue.followUp.length ? `followUp×${state.queue.followUp.length}` : ""}`
      : null;
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
                  {queueText && (
                    <MessageScrollerItem messageId="queue-marker">
                      <Marker variant="separator">
                        <MarkerContent>{queueText}</MarkerContent>
                      </Marker>
                    </MessageScrollerItem>
                  )}
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
