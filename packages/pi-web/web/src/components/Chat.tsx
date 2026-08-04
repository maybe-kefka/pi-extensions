import { useEffect, useRef, useState } from "react";
import type * as React from "react";
import { ArrowDown, Brain, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import type { ChatMessage, StreamAction, StreamState } from "@/lib/stream";

const TOOL_COLLAPSED_LIMIT = 1200;

function MessageBubble({ msg, dispatch }: { msg: ChatMessage; dispatch: React.Dispatch<StreamAction> }) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-lg bg-primary px-3 py-2 text-sm whitespace-pre-wrap text-primary-foreground">
          {msg.text}
        </div>
      </div>
    );
  }
  return (
    <div className="max-w-[92%] space-y-1">
      <div className="text-muted-foreground flex items-center gap-1 text-xs">
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
            <div className="text-muted-foreground mt-1 text-xs whitespace-pre-wrap italic">{msg.thinking}</div>
          )}
        </div>
      )}
      <div className="text-sm whitespace-pre-wrap break-words">
        {msg.text}
        {msg.streaming && !msg.text && <span className="animate-pulse">▍</span>}
      </div>
    </div>
  );
}

function ToolRowView({ row, dispatch }: { row: StreamState["tools"][number]; dispatch: React.Dispatch<StreamAction> }) {
  const collapsed = !row.expanded && row.output.length > TOOL_COLLAPSED_LIMIT;
  const display = collapsed ? `${row.output.slice(0, TOOL_COLLAPSED_LIMIT)}\n…（已折叠，点击展开）` : row.output;
  return (
    <div className={`max-w-[92%] rounded-md border px-3 py-2 text-xs ${row.isError ? "border-destructive/60 text-destructive" : "border-border"}`}>
      <button
        className="text-muted-foreground flex items-center gap-1 hover:underline"
        onClick={() => dispatch({ type: "toggle_tool", id: row.toolCallId })}
      >
        <span className="font-medium">⚙ {row.toolName}</span>
        {!row.final && <Loader2 className="size-3 animate-spin" />}
        {row.output.length > TOOL_COLLAPSED_LIMIT && (row.expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />)}
      </button>
      {row.args !== null && row.args !== undefined && (
        <div className="text-muted-foreground mt-1 line-clamp-2 font-mono">{JSON.stringify(row.args)}</div>
      )}
      {display && <pre className="mt-1 max-h-96 overflow-y-auto whitespace-pre-wrap font-mono">{display}</pre>}
    </div>
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
            <div className="space-y-3">
              {state.messages.map((m) => (
                <MessageBubble key={m.id} msg={m} dispatch={dispatch} />
              ))}
              {state.tools.map((t) => (
                <ToolRowView key={t.toolCallId} row={t} dispatch={dispatch} />
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
