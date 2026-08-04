import { useState } from "react";
import { Square, SendHorizonal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { StreamState } from "@/lib/stream";

export function InputBar(props: {
  busy: boolean;
  queue: StreamState["queue"];
  conn: StreamState["conn"];
  onSend: (text: string, deliverAs?: "steer" | "followUp") => void;
  onAbort: () => void;
}) {
  const { busy, queue, conn, onSend, onAbort } = props;
  const [text, setText] = useState("");
  const [deliverAs, setDeliverAs] = useState<"steer" | "followUp">("followUp");

  const submit = () => {
    const t = text.trim();
    if (!t) return;
    onSend(t, busy ? deliverAs : undefined);
    setText("");
  };

  return (
    <footer className="border-t p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      {busy && (
        <div className="mb-2 flex items-center gap-3 text-xs text-warning">
          <span className="flex items-center gap-1.5">
            <span className="bg-warning size-2 animate-pulse rounded-full" />
            agent 忙碌
          </span>
          {queue.steering.length + queue.followUp.length > 0 && (
            <span className="text-muted-foreground">
              队列: steer×{queue.steering.length} followUp×{queue.followUp.length}
            </span>
          )}
          <Select value={deliverAs} onValueChange={(v) => setDeliverAs(v as "steer" | "followUp")}>
            <SelectTrigger size="sm" className="h-7 w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="followUp">排队 (followUp)</SelectItem>
                <SelectItem value="steer">打断 (steer)</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          <Button size="sm" variant="destructive" className="ml-auto h-7" onClick={onAbort}>
            <Square data-icon="inline-start" /> abort
          </Button>
        </div>
      )}
      <div className="flex items-end gap-2">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="消息…（Enter 发送，Shift+Enter 换行）"
          className="min-h-10 max-h-40 flex-1 resize-none"
          rows={1}
        />
        <Button onClick={submit} disabled={conn !== "open" || text.trim() === ""}>
          <SendHorizonal data-icon="inline-start" /> 发送
        </Button>
      </div>
    </footer>
  );
}
