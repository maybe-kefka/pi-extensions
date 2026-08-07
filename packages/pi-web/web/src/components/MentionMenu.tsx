import { FileText, Loader2, Sparkles, Terminal } from "lucide-react";
import type { MentionKind } from "@/lib/mention";

/** 上拉框候选条目（InputBar 组装） */
export interface MentionItem {
  id: string;
  label: string;
  /** 选中后插入输入框的文本 */
  insert: string;
  /** 是否渲染为原子 chip（skill/file）；命令为纯文本 */
  chip: boolean;
  group: string;
}

/**
 * 上拉框（ChatGPT 式 mention menu）：输入框上方弹出，上下键/回车/Esc/点击。
 * 纯展示组件：导航状态由 InputBar 持有。
 */
export function MentionMenu({
  open,
  kind,
  items,
  activeIndex,
  loading,
  onSelect,
  onHover,
}: {
  open: boolean;
  kind: MentionKind | null;
  items: MentionItem[];
  activeIndex: number;
  loading: boolean;
  onSelect: (item: MentionItem) => void;
  onHover: (index: number) => void;
}) {
  if (!open) return null;
  const groups: { group: string; items: MentionItem[] }[] = [];
  for (const it of items) {
    const g = groups.find((x) => x.group === it.group);
    if (g) g.items.push(it);
    else groups.push({ group: it.group, items: [it] });
  }
  let flatIndex = 0;

  return (
    <div
      data-slot="mention-menu"
      className="border-border bg-popover text-popover-foreground absolute right-0 bottom-full z-50 mb-1.5 max-h-64 w-full overflow-y-auto rounded-xl border p-1 shadow-md"
      role="listbox"
    >
      {loading && items.length === 0 ? (
        <div className="text-muted-foreground flex items-center gap-1.5 px-2 py-2 text-xs">
          <Loader2 className="size-3 animate-spin" /> 加载中…
        </div>
      ) : items.length === 0 ? (
        <div className="text-muted-foreground px-2 py-2 text-xs">
          {kind === "file" ? "无匹配文件" : "无匹配项"}
        </div>
      ) : (
        groups.map((g) => (
          <div key={g.group}>
            <div className="text-muted-foreground px-2 py-1 text-[10px] font-semibold tracking-wide uppercase">
              {g.group}
            </div>
            {g.items.map((it) => {
              const idx = flatIndex++;
              const Icon = kind === "file" ? FileText : it.chip ? Sparkles : Terminal;
              return (
                <button
                  key={it.id}
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
                  {it.chip && <span className="text-muted-foreground/60 shrink-0 text-[10px]">chip</span>}
                </button>
              );
            })}
          </div>
        ))
      )}
    </div>
  );
}
