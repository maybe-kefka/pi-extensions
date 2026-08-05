import { useRef, useState } from "react";
import { Plus, SendHorizonal, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PlusPicker } from "@/components/PlusPicker";
import type { FileGroup, SkillInfo } from "@/lib/types";
import type { StreamState } from "@/lib/stream";

export function InputBar(props: {
  busy: boolean;
  queue: StreamState["queue"];
  conn: StreamState["conn"];
  skills: SkillInfo[];
  files: FileGroup[];
  pickerLoading: boolean;
  onSend: (text: string, deliverAs?: "steer" | "followUp") => void;
  onAbort: () => void;
  onPickerOpen: () => void;
}) {
  const { busy, queue, conn, skills, files, pickerLoading, onSend, onAbort, onPickerOpen } = props;
  const [text, setText] = useState("");
  const [deliverAs, setDeliverAs] = useState<"steer" | "followUp">("followUp");
  const [pickerOpen, setPickerOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const submit = () => {
    const t = text.trim();
    if (!t) return;
    onSend(t, busy ? deliverAs : undefined);
    setText("");
  };

  const insert = (chunk: string) => {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    const next = text.slice(0, start) + chunk + (el && start !== end ? "" : " ") + text.slice(end);
    setText(next);
    setPickerOpen(false);
    requestAnimationFrame(() => {
      const el2 = textareaRef.current;
      if (el2) {
        const pos = start + chunk.length + (el && start !== end ? 0 : 1);
        el2.focus();
        el2.setSelectionRange(pos, pos);
      }
    });
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
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground size-9 shrink-0 cursor-pointer rounded-full"
          title="插入 skill 或文件"
          onClick={() => {
            setPickerOpen(true);
            onPickerOpen();
          }}
        >
          <Plus className="size-5" />
        </Button>
        <Textarea
          ref={textareaRef}
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
      <PlusPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        skills={skills}
        files={files}
        loading={pickerLoading}
        onInsert={insert}
      />
    </footer>
  );
}
