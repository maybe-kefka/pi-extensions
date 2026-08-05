import { useCallback, useRef, useState } from "react";
import type * as React from "react";
import { Plus, SendHorizonal, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PlusPicker, type InsertKind } from "@/components/PlusPicker";
import { isContentEmpty, serializeContent } from "@/lib/chip-serialize";
import type { FileGroup, SkillInfo } from "@/lib/types";
import type { StreamState } from "@/lib/stream";

/** chip 视觉：按插入类型区分 */
const CHIP_STYLES: Record<InsertKind, { icon: string; cls: string }> = {
  skill: { icon: "✨", cls: "bg-purple-500/15 text-purple-400" },
  file: { icon: "📄", cls: "bg-sky-500/15 text-sky-400" },
  text: { icon: "", cls: "bg-muted text-foreground" },
};

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
  const [deliverAs, setDeliverAs] = useState<"steer" | "followUp">("followUp");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [hasInput, setHasInput] = useState(false);
  const editorRef = useRef<HTMLDivElement | null>(null);

  const submit = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const t = serializeContent(el).trim();
    if (!t) return;
    onSend(t, busy ? deliverAs : undefined);
    el.innerHTML = "";
    setHasInput(false);
  }, [busy, deliverAs, onSend]);

  /** 在光标处插入原子 chip（contenteditable=false，浏览器原生支持像文本一样删除整块） */
  const insertChip = useCallback((label: string, insertText: string, kind: InsertKind) => {
    const el = editorRef.current;
    if (!el) return;
    const style = CHIP_STYLES[kind];
    const span = document.createElement("span");
    span.contentEditable = "false";
    span.dataset.insert = insertText;
    span.className = `${style.cls} mx-0.5 inline-flex cursor-default items-center gap-1 rounded-md px-1.5 py-0.5 align-middle text-xs font-medium whitespace-nowrap`;
    span.textContent = `${style.icon} ${label}`.trim();
    const space = document.createTextNode(" ");

    // 定位光标（在编辑器内才插入到光标处，否则追加末尾）
    const sel = window.getSelection();
    let range: Range | null = null;
    if (sel && sel.rangeCount > 0) {
      const r = sel.getRangeAt(0);
      if (el.contains(r.commonAncestorContainer)) range = r.cloneRange();
    }
    if (range) {
      range.deleteContents();
      range.insertNode(span);
      range.insertNode(space);
      range.setStartAfter(space);
      range.setEndAfter(space);
    } else {
      el.appendChild(span);
      el.appendChild(space);
      range = document.createRange();
      range.setStartAfter(space);
      range.setEndAfter(space);
    }
    sel?.removeAllRanges();
    sel?.addRange(range);
    el.focus();
    setHasInput(true);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      // 中文输入法组词回车不触发发送
      if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault();
        submit();
      }
    },
    [submit],
  );

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    try {
      document.execCommand("insertText", false, text);
    } catch {
      // 极端 fallback：手动插入文本节点
      const el = editorRef.current;
      if (!el) return;
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const r = sel.getRangeAt(0);
        if (el.contains(r.commonAncestorContainer)) {
          r.deleteContents();
          r.insertNode(document.createTextNode(text));
        }
      } else {
        el.appendChild(document.createTextNode(text));
      }
    }
    setHasInput(true);
  }, []);

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
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          className="border-input bg-background focus-visible:ring-ring/50 flex min-h-10 max-h-40 flex-1 resize-none items-center overflow-y-auto rounded-md border px-3 py-2 text-sm focus-visible:ring-[3px] focus-visible:outline-none"
          onInput={() => setHasInput(true)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onFocus={() => setHasInput(!isContentEmpty(editorRef.current as HTMLElement))}
        />
        <Button onClick={submit} disabled={conn !== "open" || !hasInput}>
          <SendHorizonal data-icon="inline-start" /> 发送
        </Button>
      </div>
      <PlusPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        skills={skills}
        files={files}
        loading={pickerLoading}
        onInsert={(text, kind) => insertChip(text, text, kind)}
      />
    </footer>
  );
}
