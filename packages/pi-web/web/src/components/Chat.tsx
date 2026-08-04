import { useState } from "react";
import type * as React from "react";
import { Bot, Brain, ChevronDown, ChevronRight, CircleCheck, CircleX, Loader2, User } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
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
import type { ChatMessage, StreamAction, StreamState } from "@/lib/stream";

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

/** QQ 风格：Message 行 + Bubble 表面。文字折行由 BubbleContent 内置 wrap-break-word 处理。 */
function MessageBubble({
  msg,
  tools,
  dispatch,
}: {
  msg: ChatMessage;
  tools: StreamState["tools"];
  dispatch: React.Dispatch<StreamAction>;
}) {
  if (msg.role === "user") {
    return (
      <Message align="end">
        <MessageAvatar>
          <UserAvatar />
        </MessageAvatar>
        <MessageContent>
          <Bubble variant="default" align="end">
            <BubbleContent>{msg.text}</BubbleContent>
          </Bubble>
        </MessageContent>
      </Message>
    );
  }
  // 本消息声明的工具卡片（按 content 顺序，匹配实时 tools 行；到达后自动出现）
  const toolRows = msg.toolCallIds
    .map((id) => tools.find((t) => t.toolCallId === id))
    .filter((t): t is StreamState["tools"][number] => t !== undefined);
  // 空气泡隐藏：无 text 无 thinking 且非 streaming（纯工具调用消息只显示工具卡片）
  const showBubble = msg.streaming === true || msg.text.trim().length > 0 || msg.thinking.length > 0;
  // 数据层已筛空消息；此处兜底：无气泡且无工具卡片 → 整行（含头像）不渲染
  if (!showBubble && toolRows.length === 0) return null;
  return (
    <Message align="start">
      <MessageAvatar>
        <BotAvatar />
      </MessageAvatar>
      <MessageContent>
        {showBubble && (
          <>
            <MessageHeader>
              助手
              {msg.streaming && <Loader2 className="text-muted-foreground size-3 animate-spin" />}
            </MessageHeader>
            <Bubble variant="outline">
              {msg.thinking && (
                <button
                  className="bg-muted/50 text-muted-foreground flex w-fit cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-xs transition-colors hover:bg-muted"
                  onClick={() => dispatch({ type: "toggle_thinking", id: msg.id })}
                >
                  <Brain className="size-3" />
                  思考
                  {msg.thinkingExpanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                </button>
              )}
              {msg.thinking && msg.thinkingExpanded && (
                <div className="text-muted-foreground max-w-full whitespace-pre-wrap text-xs italic">
                  {msg.thinking}
                </div>
              )}
              <BubbleContent>
                {msg.text}
                {msg.streaming && !msg.text && <span className="animate-pulse">▍</span>}
              </BubbleContent>
            </Bubble>
          </>
        )}
        {toolRows.map((row) => (
          <ToolCard key={row.toolCallId} row={row} />
        ))}
      </MessageContent>
    </Message>
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

/** 工具 = 卡片风格按钮，点击弹窗展开详情 */
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
        className="flex h-auto max-w-[85%] cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-left text-xs"
        onClick={() => setOpen(true)}
      >
        <StatusIcon status={status} />
        <span className="shrink-0 font-medium">{row.toolName}</span>
        {preview && <span className="text-muted-foreground min-w-0 flex-1 truncate">{preview}</span>}
        <ChevronRight data-icon="inline-end" className="text-muted-foreground shrink-0" />
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

export function Chat({
  state,
  dispatch,
}: {
  state: StreamState;
  dispatch: React.Dispatch<StreamAction>;
}) {
  const queueText =
    state.queue.steering.length > 0 || state.queue.followUp.length > 0
      ? `队列: ${state.queue.steering.length ? `steer×${state.queue.steering.length}` : ""}${state.queue.steering.length && state.queue.followUp.length ? " " : ""}${state.queue.followUp.length ? `followUp×${state.queue.followUp.length}` : ""}`
      : null;

  // 连续同角色消息合并为一组（工具循环产生的多段 assistant 输出视觉连贯）
  const groups: { role: "user" | "assistant"; items: ChatMessage[] }[] = [];
  for (const m of state.messages) {
    const role = m.role === "assistant" ? "assistant" : "user";
    const last = groups[groups.length - 1];
    if (last && last.role === role) last.items.push(m);
    else groups.push({ role, items: [m] });
  }

  return (
    <main className="relative min-w-0 flex-1">
      <MessageScrollerProvider autoScroll>
        <MessageScroller className="min-h-0 flex-1">
          <MessageScrollerViewport>
            <MessageScrollerContent className="mx-auto w-full max-w-3xl gap-3 px-4 py-3">
              {state.messages.length === 0 && state.tools.length === 0 ? (
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
                  {groups.map((g) => (
                    <MessageScrollerItem
                      key={g.items[0].id}
                      messageId={g.items[0].id}
                      scrollAnchor={g.role === "user"}
                    >
                      <MessageGroup>
                        {g.items.map((m) => (
                          <MessageBubble key={m.id} msg={m} tools={state.tools} dispatch={dispatch} />
                        ))}
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
