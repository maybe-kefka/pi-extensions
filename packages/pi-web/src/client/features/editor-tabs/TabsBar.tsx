import { useRef, useState } from "react";
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
  const tabEls = useRef<(HTMLDivElement | null)[]>([]);
  /** 插入指示器（dragover 高频 setState；{index, x}——index 供 drop 复用，x 供渲染） */
  const [insert, setInsert] = useState<InsertPos | null>(null);
  /** 最近一次 dragover 的解析结果（drop 读 ref——drop 坐标可能不可靠，与 SplitView dropRef 同模式） */
  const insertRef = useRef<InsertPos | null>(null);

  const draggingId = (): string | null => dragRef.current ?? dragId ?? null;

  /** tablist 相对坐标 → 插入序号 + 指示器 x（各 tab 中点判定；末尾 = 最后 tab 右缘） */
  const insertPosAt = (e: React.DragEvent<HTMLDivElement>): InsertPos | null => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width === 0) return null; // 未布局（jsdom 等）——drop 走默认末尾
    const x = e.clientX - rect.left;
    const bounds: TabRect[] = tabEls.current.slice(0, tabs.length).map((el) => {
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
      role="tablist"
      className="relative scrollbar-none flex h-9 shrink-0 items-stretch overflow-x-auto border-b"
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
      {tabs.map((tab, i) => {
        const id = tabKeyOf(tab);
        const isActive = active === id;
        const label = tab.name;
        return (
          <div
            key={id}
            role="tab"
            draggable
            ref={(el) => {
              tabEls.current[i] = el;
              // React 19 cleanup ref：索引槽随卸载/重排清空，避免错位
              return () => {
                tabEls.current[i] = null;
              };
            }}
            aria-selected={isActive}
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
            className={`flex max-w-48 shrink-0 cursor-pointer items-center gap-1.5 border-r px-3 text-xs ${
              isActive ? "bg-background text-foreground shadow-[inset_0_2px_0_0_var(--primary)]" : "bg-muted/40 text-muted-foreground hover:bg-muted/60"
            }`}
            onClick={() => onActivate(id)}
            title={tab.kind === "chat" ? "聊天" : id}
          >
            {tab.kind === "chat" && <MessageSquareText className="size-3.5 shrink-0" />}
            {tab.kind === "diff" && <FileDiff className="text-muted-foreground size-3.5 shrink-0" />}
            {tab.kind === "file" && tab.dirty && <span className="bg-primary size-1.5 shrink-0 rounded-full" title="未保存" />}
            <span className={`truncate ${tab.kind === "file" && tab.preview ? "italic" : ""}`}>{label}</span>
            <button
              className="hover:bg-muted text-muted-foreground hover:text-foreground ml-0.5 flex size-4 shrink-0 items-center justify-center rounded"
              title="关闭 tab"
              onClick={(e) => {
                e.stopPropagation();
                onClose(id);
              }}
            >
              <X className="size-3" />
            </button>
          </div>
        );
      })}
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
