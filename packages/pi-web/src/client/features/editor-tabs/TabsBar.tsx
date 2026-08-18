import { useEffect, useRef, useState } from "react";
import { FileDiff, MessageSquareText, X } from "lucide-react";
import { resolveInsertIndex, tabKeyOf, type TabRect, type WorkspaceTab } from "@/entities/workspace";

export interface TabsBarProps {
  tabs: WorkspaceTab[];
  active: string;
  /** 聊天 tab 标签（当前会话名） */
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  /** 拖拽移动：from 插到 to 前（同组调序/跨组移动统一） */
  onMove: (fromId: string, toId: string) => void;
  /** 拖拽开始/结束通知（分区：拖出 tab 到主区——null = 拖拽结束） */
  onDragStartTab?: (id: string | null) => void;
  /** 追加末尾（toId=null 语义）：空栏 drop / 末尾空白 drop */
  onDropTab?: (fromId: string) => void;
  /** 外部拖拽中的 tab（跨组移动——App 状态；拖拽源组与目标组共享） */
  dragId?: string | null;
}

/** 落点解析结果：插入序号（0..n）+ 指示器 x（相对 tablist 左缘，像素） */
interface InsertPos {
  index: number;
  x: number;
}

export function TabsBar({ tabs, active, onActivate, onClose, onMove, onDragStartTab, onDropTab, dragId }: TabsBarProps) {
  const dragRef = useRef<string | null>(null);
  const tabButtonEls = useRef<(HTMLButtonElement | null)[]>([]);
  /** 插入指示器（dragover 高频 setState；{index, x}——index 供 drop 复用，x 供渲染） */
  const [insert, setInsert] = useState<InsertPos | null>(null);
  /** 最近一次 dragover 的解析结果（drop 读 ref——drop 坐标可能不可靠，与 SplitView dropRef 同模式） */
  const insertRef = useRef<InsertPos | null>(null);
  const pendingKeyboardClose = useRef<{ id: string; index: number } | null>(null);

  useEffect(() => {
    const pending = pendingKeyboardClose.current;
    if (!pending || tabs.some((tab) => tabKeyOf(tab) === pending.id)) return;
    const activeIndex = tabs.findIndex((tab) => tabKeyOf(tab) === active);
    const nextIndex = activeIndex >= 0 ? activeIndex : Math.min(pending.index, tabs.length - 1);
    tabButtonEls.current[nextIndex]?.focus();
    pendingKeyboardClose.current = null;
  }, [active, tabs]);

  const draggingId = (): string | null => dragRef.current ?? dragId ?? null;

  /** tablist 相对坐标 → 插入序号 + 指示器 x（各 tab 中点判定；末尾 = 最后 tab 右缘） */
  const insertPosAt = (e: React.DragEvent<HTMLDivElement>): InsertPos | null => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width === 0) return null; // 未布局（jsdom 等）——drop 走默认末尾
    const x = e.clientX - rect.left;
    const bounds: TabRect[] = tabButtonEls.current.slice(0, tabs.length).map((el) => {
      const r = el?.getBoundingClientRect();
      return { left: (r?.left ?? rect.left) - rect.left, width: r?.width ?? 0 };
    });
    const index = resolveInsertIndex(bounds, x);
    const last = bounds[bounds.length - 1];
    const ix = index < bounds.length ? bounds[index].left : last ? last.left + last.width : 0;
    return { index, x: ix };
  };

  return (
    <div
      data-slot="tab-drop-target"
      className="relative flex h-9 shrink-0 items-stretch border-b"
      onDragOver={(e) => {
        // 整条可落（含 tab 间隙与末尾空白）：阻止冒泡到 SplitView 的 leaf 容器（tab 栏上的拖拽不触发分区）
        e.stopPropagation();
        e.preventDefault();
        if (!draggingId()) return;
        const pos = insertPosAt(e);
        if (pos) {
          insertRef.current = pos;
          setInsert(pos);
        }
      }}
      onDragLeave={(e) => {
        // 真正离开 tab 栏才清除指示器（dragleave 在进入子元素时也触发——relatedTarget 仍在栏内则忽略）
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        insertRef.current = null;
        setInsert(null);
      }}
      onDrop={(e) => {
        e.stopPropagation();
        e.preventDefault();
        const from = draggingId();
        if (!from) {
          setInsert(null);
          return;
        }
        const index = insertRef.current?.index ?? tabs.length;
        if (index < tabs.length) {
          onMove(from, tabKeyOf(tabs[index]!));
        } else {
          onDropTab?.(from);
        }
        onDragStartTab?.(null); // drop 即拖拽结束（dragend 可能不触发 → SplitView 高亮残留）
        dragRef.current = null;
        insertRef.current = null;
        setInsert(null);
      }}
    >
      {tabs.length > 0 && (
        <div role="tablist" aria-label="工作区标签" className="scrollbar-none flex min-w-0 flex-1 items-stretch overflow-x-auto">
          {tabs.map((tab, i) => {
            const id = tabKeyOf(tab);
            const isActive = active === id;
            const label = tab.name;
            return (
              <button
                key={id}
                draggable
                ref={(el) => {
                  tabButtonEls.current[i] = el;
                  return () => { tabButtonEls.current[i] = null; };
                }}
                onDragStart={(e) => {
                  dragRef.current = id;
                  e.dataTransfer.effectAllowed = "move";
                  onDragStartTab?.(id);
                }}
                onDragEnd={() => {
                  dragRef.current = null;
                  setInsert(null);
                  onDragStartTab?.(null);
                }}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-label={label}
                aria-keyshortcuts="Delete"
                tabIndex={isActive || (!tabs.some((item) => tabKeyOf(item) === active) && i === 0) ? 0 : -1}
                className={`flex max-w-48 shrink-0 items-center gap-1.5 px-3 text-left text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  isActive ? "bg-canvas text-foreground shadow-[inset_0_-2px_0_0_var(--primary)]" : "text-muted-foreground hover:bg-hover hover:text-foreground"
                } ${tab.kind === "file" && tab.preview ? "italic" : ""}`}
                onClick={() => onActivate(id)}
                onKeyDown={(e) => {
                  const move = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
                  if (move !== 0) {
                    e.preventDefault();
                    const next = (i + move + tabs.length) % tabs.length;
                    const nextId = tabKeyOf(tabs[next]!);
                    tabButtonEls.current[next]?.focus();
                    onActivate(nextId);
                  } else if (e.key === "Home" || e.key === "End") {
                    e.preventDefault();
                    const next = e.key === "Home" ? 0 : tabs.length - 1;
                    const nextId = tabKeyOf(tabs[next]!);
                    tabButtonEls.current[next]?.focus();
                    onActivate(nextId);
                  } else if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onActivate(id);
                  } else if (e.key === "Delete") {
                    e.preventDefault();
                    pendingKeyboardClose.current = { id, index: i };
                    onClose(id);
                  }
                }}
                title={tab.kind === "chat" ? "聊天" : id}
              >
                {tab.kind === "chat" && <MessageSquareText aria-hidden="true" className="size-3.5 shrink-0" />}
                {tab.kind === "diff" && <FileDiff aria-hidden="true" className="text-muted-foreground size-3.5 shrink-0" />}
                {tab.kind === "file" && tab.dirty && <span className="bg-primary size-1.5 shrink-0 rounded-full" title="未保存" />}
                <span className="min-w-0 flex-1 truncate">{label}</span>
                <span
                  aria-hidden="true"
                  title="关闭 tab"
                  className="text-muted-foreground hover:bg-hover hover:text-foreground flex size-4 shrink-0 items-center justify-center rounded"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onClose(id);
                  }}
                >
                  <X aria-hidden="true" className="size-3" />
                </span>
              </button>
            );
          })}
        </div>
      )}
      {insert && (
        <div
          data-slot="tab-insert-indicator"
          data-index={insert.index}
          className="bg-primary pointer-events-none absolute inset-y-1 z-10 w-0.5 rounded"
          style={{ left: insert.x }}
        />
      )}
    </div>
  );
}
