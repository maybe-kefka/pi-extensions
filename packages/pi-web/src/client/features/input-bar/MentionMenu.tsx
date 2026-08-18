import { useEffect, useRef } from "react";
import { FileText, Folder, Loader2, Sparkles, Terminal } from "lucide-react";
import type { MentionKind } from "@/features/input-bar";

/** 上拉框候选条目（InputBar 组装） */
export interface MentionOption {
  id: string;
  label: string;
  /** 选中后插入输入框的文本 */
  insert: string;
  /** 是否渲染为原子 chip（skill/file）；命令为纯文本 */
  chip: boolean;
  group: string;
  /** 文件面板：目录条目（📁） */
  isDir?: boolean;
}

const VISIBLE_ROWS = 8;
/** 单行高约 28px（py-1.5 + text-xs），8 行窗口 + 少量标题余量 */
const MENU_MAX_HEIGHT = VISIBLE_ROWS * 28 + 24;

/**
 * 上拉框（ChatGPT 式 mention menu）：输入框上方弹出，可见窗口 8 行，
 * 高亮行自动滚入视野（block: nearest）。纯展示组件：导航状态由 InputBar 持有。
 */
export function MentionMenu({
  open,
  kind,
  items,
  activeIndex,
  loading,
  emptyLabel,
  onSelect,
  onHover,
}: {
  open: boolean;
  kind: MentionKind | null;
  items: MentionOption[];
  activeIndex: number;
  loading: boolean;
  /** R21：空态文案（区分“当前目录无文件可引用”/“无匹配文件”/“无匹配项”） */
  emptyLabel: string;
  onSelect: (item: MentionOption) => void;
  onHover: (index: number) => void;
}) {
  const activeRef = useRef<HTMLButtonElement | null>(null);

  // 高亮行滚动跟随：activeIndex 变化时把高亮项滚入 8 行窗口内
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  if (!open) return null;
  const groups: { group: string; items: MentionOption[] }[] = [];
  for (const it of items) {
    const g = groups.find((x) => x.group === it.group);
    if (g) g.items.push(it);
    else groups.push({ group: it.group, items: [it] });
  }
  let flatIndex = 0;

  return (
    <div
      data-slot="mention-menu"
      className="border-border bg-popover text-popover-foreground scrollbar-thin absolute right-0 bottom-full z-50 mb-1.5 w-full overflow-y-auto rounded-xl border p-1 shadow-md"
      style={{ maxHeight: MENU_MAX_HEIGHT }}
      role="listbox"
    >
      {loading && items.length === 0 ? (
        <div className="text-muted-foreground flex items-center gap-1.5 px-2 py-2 text-xs">
          <Loader2 className="size-3 animate-spin" /> 加载中…
        </div>
      ) : items.length === 0 ? (
        <div className="text-muted-foreground px-2 py-2 text-xs">{emptyLabel}</div>
      ) : (
        groups.map((g) => (
          <div key={g.group}>
            <div className="text-muted-foreground px-2 py-1 text-[11px] font-semibold tracking-wide uppercase">
              {g.group}
            </div>
            {g.items.map((it) => {
              const idx = flatIndex++;
              const Icon = kind === "file" ? (it.isDir ? Folder : FileText) : it.chip ? Sparkles : Terminal;
              return (
                <button
                  key={it.id}
                  ref={idx === activeIndex ? activeRef : undefined}
                  role="option"
                  aria-selected={idx === activeIndex}
                  className={`flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs ${
                    idx === activeIndex ? "bg-muted" : ""
                  }`}
                  onMouseEnter={() => onHover(idx)}
                  onClick={() => onSelect(it)}
                >
                  <Icon className="text-muted-foreground size-3 shrink-0" />
                  <span className="min-w-0 flex-1 truncate font-mono">{it.label}</span>
                  {it.chip && <span className="text-muted-foreground/60 shrink-0 text-[11px]">chip</span>}
                </button>
              );
            })}
          </div>
        ))
      )}
    </div>
  );
}
