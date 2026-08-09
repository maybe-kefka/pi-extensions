import { useCallback, useMemo, useRef, useState } from "react";
import type * as React from "react";
import { ArrowUp, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MentionMenu, type MentionItem } from "@/components/MentionMenu";
import { isContentEmpty, serializeContent } from "@/lib/chip-serialize";
import { filterMentionItems, mentionInitial, mentionKeyAt, deriveQueryFromHead } from "@/lib/mention";
import type { CommandInfo, FileGroup, SkillInfo } from "@/lib/types";
import type { StreamState } from "@/lib/stream";

/** chip 视觉：按插入类型区分（skill/file 为原子 chip，command 为纯文本不渲染 chip） */
const CHIP_STYLES: Record<"skill" | "file", { icon: string; cls: string }> = {
  skill: { icon: "✨", cls: "bg-purple-500/15 text-purple-400" },
  file: { icon: "📄", cls: "bg-sky-500/15 text-sky-400" },
};

export function InputBar(props: {
  busy: boolean;
  queue: StreamState["queue"];
  conn: StreamState["conn"];
  skills: SkillInfo[];
  commands: CommandInfo[];
  files: FileGroup[];
  pickerLoading: boolean;
  onSend: (text: string) => void;
  onAbort: () => void;
  onPickerOpen: () => void;
}) {
  const { busy, queue, conn, skills, commands, files, pickerLoading, onSend, onAbort, onPickerOpen } = props;
  const [hasInput, setHasInput] = useState(false);
  // mention 状态机用 ref 同步更新（连续按键同 tick 时 React 批量更新会让第二次 keydown 读到旧状态，
  // 导致 space 后紧跟 / 的触发序列丢失）；tick 仅驱动渲染
  const mentionRef = useRef(mentionInitial);
  const [mentionTick, setMentionTick] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const mention = mentionRef.current;

  const resetMention = useCallback(() => {
    mentionRef.current = mentionInitial;
    setMentionTick((t) => t + 1);
    setActiveIndex(0);
  }, []);

  const submit = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const t = serializeContent(el).trim();
    if (!t) return;
    onSend(t);
    el.innerHTML = "";
    setHasInput(false);
    resetMention();
  }, [onSend, resetMention]);

  /**
   * 删除"触发字符 + 过滤词"（光标前最近出现的 " /" 或 " @" 之后的所有内容）。
   * 触发后继续输入的过滤词（如 /cod 的 cod）会残留在文本里，必须一并删除。
   * 返回是否删除了触发序列（未找到 → false，触发字符保留）。
   */
  const stripTriggerChars = useCallback((el: HTMLElement): boolean => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return false;
    const r = sel.getRangeAt(0);
    if (!r.collapsed) return false;
    const node = r.startContainer;
    const offset = r.startOffset;
    if (node.nodeType !== Node.TEXT_NODE) return false;
    const text = node.textContent ?? "";
    // 从光标往前找最近出现的触发序列；contenteditable 中空格可能被浏览器存为 nbsp（ ）
    const head = text.slice(0, offset);
    // 空格序列（含 nbsp 变体）；无空格序列但 head 以 / 或 @ 开头（行首触发）→ 从 0 删
    let idx = Math.max(
      head.lastIndexOf(" /"),
      head.lastIndexOf("\u00a0/"),
      head.lastIndexOf(" @"),
      head.lastIndexOf("\u00a0@"),
    );
    if (idx < 0 && (head.startsWith("/") || head.startsWith("@"))) idx = 0;
    if (idx < 0) return false;
    node.textContent = text.slice(0, idx) + text.slice(offset);
    const nr = document.createRange();
    nr.setStart(node, idx);
    nr.collapse(true);
    sel.removeAllRanges();
    sel.addRange(nr);
    return true;
  }, []);

  /** 在光标处插入原子 chip（contenteditable=false，浏览器原生支持像文本一样删除整块） */
  const insertChip = useCallback((label: string, insertText: string, kind: "skill" | "file") => {
    const el = editorRef.current;
    if (!el) return;
    const style = CHIP_STYLES[kind];
    const span = document.createElement("span");
    span.contentEditable = "false";
    span.dataset.insert = insertText;
    span.className = `${style.cls} mx-0.5 inline-flex cursor-default items-center gap-1 rounded-md px-1.5 py-0.5 align-middle text-xs font-medium whitespace-nowrap`;
    span.textContent = `${style.icon} ${label}`.trim();
    const space = document.createTextNode(" ");

    const sel = window.getSelection();
    let range: Range | null = null;
    if (sel && sel.rangeCount > 0) {
      const r = sel.getRangeAt(0);
      if (el.contains(r.commonAncestorContainer)) range = r.cloneRange();
    }
    if (range) {
      range.deleteContents();
      // 用 DocumentFragment 一次插入 chip + 尾随空格（两次 insertNode 会让 range 漂移）
      const frag = document.createDocumentFragment();
      frag.appendChild(span);
      frag.appendChild(space);
      range.insertNode(frag);
    } else {
      el.appendChild(span);
      el.appendChild(space);
    }
    // 独立 range 显式放置光标：chip 尾随空格之后（插入节点的 range 内部边界不可靠）
    const caret = document.createRange();
    caret.setStartAfter(space);
    caret.collapse(true);
    sel?.removeAllRanges();
    sel?.addRange(caret);
    el.focus();
    setHasInput(true);
  }, []);

  /** 插入纯文本（命令） */
  const insertText = useCallback((text: string) => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    const insert = () => {
      const node = document.createTextNode(text);
      el.appendChild(node);
      const r = document.createRange();
      r.setStart(node, text.length);
      r.collapse(true);
      sel?.removeAllRanges();
      sel?.addRange(r);
    };
    if (sel && sel.rangeCount > 0) {
      const r = sel.getRangeAt(0);
      if (el.contains(r.commonAncestorContainer)) {
        r.deleteContents();
        const node = document.createTextNode(text);
        r.insertNode(node);
        const nr = document.createRange();
        nr.setStart(node, text.length);
        nr.collapse(true);
        sel.removeAllRanges();
        sel.addRange(nr);
        setHasInput(true);
        return;
      }
    }
    insert();
    setHasInput(true);
  }, []);

  /** 上拉框候选（按 mention.kind 组装 + 前缀过滤） */
  const mentionItems = useMemo<MentionItem[]>(() => {
    if (!mention.active) return [];
    if (mention.kind === "file") {
      const items: MentionItem[] = [];
      for (const g of files) {
        for (const f of g.files) {
          items.push({
            id: `file:${f.path}`,
            label: f.path,
            insert: f.path,
            chip: true,
            group: g.dir === "." ? "根目录" : g.dir,
            isDir: f.isDir,
          });
        }
      }
      return filterMentionItems(items, mention.query);
    }
    const items: MentionItem[] = [
      ...skills.map((s) => ({ id: `skill:${s.name}`, label: `skill:${s.name}`, insert: `/skill:${s.name}`, chip: true, group: "Skills" })),
      ...commands.map((c) => ({ id: `cmd:${c.name}`, label: `/${c.name}`, insert: `/${c.name}`, chip: false, group: "命令" })),
    ];
    return filterMentionItems(items, mention.query);
  }, [mention.active, mention.kind, mention.query, skills, commands, files]);

  const selectMention = useCallback(
    (item: MentionItem) => {
      const el = editorRef.current;
      if (!el) return;
      // 删除触发字符（" /" / " @"）——光标位置无效时 fallback 追加
      const stripped = stripTriggerChars(el);
      if (item.chip) {
        insertChip(item.label, item.insert, mention.kind === "file" ? "file" : "skill");
      } else {
        insertText(item.insert);
      }
      if (!stripped) {
        // 未删除触发字符（光标不在编辑器文本末尾）：触发字符保留可接受
      }
      resetMention();
    },
    [stripTriggerChars, insertChip, insertText, mention.kind, resetMention],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      // 上拉框激活：接管导航与选中（输入字符照常进入编辑器，query 由字符累积）
      if (mention.active) {
        if (e.key === "Enter") {
          e.preventDefault();
          if (mentionItems.length > 0) {
            const item = mentionItems[Math.min(activeIndex, mentionItems.length - 1)];
            selectMention(item);
          } else {
            resetMention();
          }
          return;
        }
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          if (mentionItems.length === 0) return;
          setActiveIndex((i) => {
            const n = mentionItems.length;
            return e.key === "ArrowDown" ? (i + 1) % n : (i - 1 + n) % n;
          });
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          resetMention();
          return;
        }
      }
      // 发送：Enter（无 shift、非 IME 组词）；上拉框激活时已被接管
      if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && !mention.active) {
        e.preventDefault();
        submit();
        return;
      }
      // 触发检测与 query 累积（同步更新 ref，避免连续按键同 tick 丢失触发序列）
      // R18：行首（光标前无任何内容）时 / @ 直接触发
      const el = editorRef.current;
      const cursorAtStart =
        (e.key === "/" || e.key === "@" || e.key === " ") && el ? isCursorAtLineStart(el) : false;
      const next = mentionKeyAt(mentionRef.current, e.key, cursorAtStart);
      if (next !== mentionRef.current) {
        const wasActive = mentionRef.current.active;
        mentionRef.current = next;
        setMentionTick((t) => t + 1);
        setActiveIndex(0);
        // 懒加载兜底（连接建立时已预拉，这里用于刷新）
        if (next.active && !wasActive) onPickerOpen();
      }
    },
    [mention, mentionItems, activeIndex, selectMention, submit, resetMention, onPickerOpen],
  );

  /** R18：IME 上屏等不经 keydown 的输入——从 DOM 反推 query（与 keydown 累积双轨） */
  const handleInput = useCallback(() => {
    setHasInput(true);
    const el = editorRef.current;
    if (!el || !mentionRef.current.active) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const r = sel.getRangeAt(0);
    const probe = document.createRange();
    probe.setStart(el, 0);
    probe.setEnd(r.startContainer, r.startOffset);
    const q = deriveQueryFromHead(probe.toString());
    if (q !== null && q !== mentionRef.current.query) {
      mentionRef.current = { ...mentionRef.current, query: q };
      setMentionTick((t) => t + 1);
    }
  }, []);

  /** 光标是否在输入框行首（光标前无任何内容；contenteditable 中空格已含 nbsp，直接 toString 判断） */
  const isCursorAtLineStart = useCallback((el: HTMLElement): boolean => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return false;
    const r = sel.getRangeAt(0);
    if (!r.collapsed) return false;
    const probe = document.createRange();
    probe.setStart(el, 0);
    try {
      probe.setEnd(r.startContainer, r.startOffset);
    } catch {
      return false;
    }
    return probe.toString().trim().length === 0;
  }, []);

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    try {
      document.execCommand("insertText", false, text);
    } catch {
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

  const queued = queue.followUp.length;

  return (
    <footer className="border-t p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      {queued > 0 && (
        <div className="text-muted-foreground mb-2 flex items-center gap-1.5 text-xs">
          <span className="bg-muted size-1.5 animate-pulse rounded-full" />
          已排队 {queued} 条，当前任务结束后自动发送
        </div>
      )}
      <div className="relative flex items-end gap-2">
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          className="border-input bg-background focus-visible:ring-ring/50 min-h-10 max-h-40 flex-1 resize-none overflow-y-auto rounded-md border px-3 py-2 text-sm focus-visible:ring-[3px] focus-visible:outline-none"
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onFocus={() => setHasInput(!isContentEmpty(editorRef.current as HTMLElement))}
        />
        <MentionMenu
          open={mention.active}
          kind={mention.kind}
          items={mentionItems}
          activeIndex={activeIndex}
          loading={pickerLoading}
          onSelect={selectMention}
          onHover={setActiveIndex}
        />
        {busy ? (
          <Button
            variant="ghost"
            size="icon"
            className="bg-primary text-primary-foreground hover:bg-primary/90 size-9 shrink-0 cursor-pointer rounded-full"
            onClick={onAbort}
            title="停止生成"
          >
            <Square className="size-4 fill-current" />
          </Button>
        ) : (
          <Button
            size="icon"
            className="size-9 shrink-0 cursor-pointer rounded-full"
            onClick={() => {
              // 上拉框打开时点击发送 → 关闭面板不发送
              if (mention.active) {
                resetMention();
                return;
              }
              submit();
            }}
            disabled={conn !== "open" || !hasInput}
            title="发送"
          >
            <ArrowUp className="size-4" />
          </Button>
        )}
      </div>
    </footer>
  );
}
