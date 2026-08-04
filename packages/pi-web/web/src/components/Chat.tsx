import { useEffect, useRef, useState } from "react";
import type * as React from "react";
import { ArrowDown, Bot, Brain, ChevronDown, ChevronRight, CircleCheck, CircleX, Loader2, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import type { ChatMessage, StreamAction, StreamState } from "@/lib/stream";

function Avatar({ kind }: { kind: "user" | "assistant" }) {
  return (
    <div className="bg-muted flex size-7 shrink-0 items-center justify-center rounded-full sm:size-8">
      {kind === "assistant" ? <Bot className="size-4" /> : <User className="size-4" />}
    </div>
  );
}

/** QQ 风格：头像 + 气泡卡片。文字强制折行（overflow-wrap:anywhere）。 */
function MessageBubble({ msg, dispatch }: { msg: ChatMessage; dispatch: React.Dispatch<StreamAction> }) {
  if (msg.role === "user") {
    return (
      <div className="flex items-end justify-end gap-2">
        <div className="bg-primary text-primary-foreground max-w-[80%] rounded-2xl rounded-br-md px-3.5 py-2 text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">
          {msg.text}
        </div>
        <Avatar kind="user" />
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2">
      <Avatar kind="assistant" />
      <div className="bg-card border-border min-w-0 max-w-[80%] space-y-1 rounded-2xl rounded-bl-md border px-3.5 py-2 shadow-sm">
        <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <span>助手</span>
          {msg.streaming && <Loader2 className="size-3 animate-spin" />}
        </div>
        {msg.thinking && (
          <div className="border-l pl-3">
            <button
              className="text-muted-foreground flex items-center gap-1 text-xs hover:underline"
              onClick={() => dispatch({ type: "toggle_thinking", id: msg.id })}
            >
              <Brain className="size-3" />
              思考
              {msg.thinkingExpanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
            </button>
            {msg.thinkingExpanded && (
              <div className="text-muted-foreground mt-1 text-xs whitespace-pre-wrap italic [overflow-wrap:anywhere]">
                {msg.thinking}
              </div>
            )}
          </div>
        )}
        <div className="text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">
          {msg.text}
          {msg.streaming && !msg.text && <span className="animate-pulse">▍</span>}
        </div>
      </div>
    </div>
  );
}

type ToolStatus = "running" | "done" | "error";

function toolStatus(row: StreamState["tools"][number]): ToolStatus {
  if (!row.final) return "running";
  return row.isError ? "error" : "done";
}

function StatusIcon({ status }: { status: ToolStatus }) {
  if (status === "running") return <Loader2 className="size-3.5 animate-spin text-muted-foreground" />;
  if (status === "error") return <CircleX className="text-destructive size-3.5" />;
  return <CircleCheck className="size-3.5 text-emerald-500" />;
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
      <button
        onClick={() => setOpen(true)}
        className="bg-card border-border hover:bg-accent/50 flex max-w-[85%] cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs shadow-sm transition-colors"
      >
        <StatusIcon status={status} />
        <span className="shrink-0 font-medium">{row.toolName}</span>
        {preview && <span className="text-muted-foreground min-w-0 flex-1 truncate">{preview}</span>}
        <ChevronRight className="text-muted-foreground size-3.5 shrink-0" />
      </button>

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
  const scrollRef = useRef<HTMLDivElement>(null);
  const [stick, setStick] = useState(true);

  const scrollToBottom = () => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  };

  useEffect(() => {
    if (stick) scrollToBottom();
  }, [state.messages, state.tools, state.queue, stick]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    setStick(nearBottom);
  };

  const queueText =
    state.queue.steering.length > 0 || state.queue.followUp.length > 0
      ? `队列: ${state.queue.steering.length ? `steer×${state.queue.steering.length}` : ""}${state.queue.steering.length && state.queue.followUp.length ? " " : ""}${state.queue.followUp.length ? `followUp×${state.queue.followUp.length}` : ""}`
      : null;

  return (
    <main className="relative min-w-0 flex-1">
      <ScrollArea className="h-full">
        <div ref={scrollRef} onScroll={onScroll} className="h-full overflow-y-auto px-4 py-3">
          <div className="mx-auto max-w-3xl">
            {state.messages.length === 0 && state.tools.length === 0 ? (
              <div className="text-muted-foreground mt-16 text-center text-sm">
                暂无消息{state.conn === "open" ? "，发送第一条消息开始" : "，等待连接…"}
              </div>
            ) : null}
            <div className="flex flex-col gap-3">
              {state.messages.map((m) => (
                <MessageBubble key={m.id} msg={m} dispatch={dispatch} />
              ))}
              {state.tools.map((t) => (
                <ToolCard key={t.toolCallId} row={t} />
              ))}
            </div>
            {queueText && (
              <div className="mt-2">
                <Separator className="my-2" />
                <div className="text-muted-foreground text-center text-xs">{queueText}</div>
              </div>
            )}
          </div>
        </div>
      </ScrollArea>
      {!stick && (
        <Button
          size="sm"
          variant="outline"
          className="absolute right-4 bottom-4 shadow-md"
          onClick={() => {
            setStick(true);
            scrollToBottom();
          }}
        >
          <ArrowDown className="size-3.5" /> 回到底部
        </Button>
      )}
    </main>
  );
}
