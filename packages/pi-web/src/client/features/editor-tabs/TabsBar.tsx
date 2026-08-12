import { useRef, useState } from "react";
import { FileDiff, MessageSquareText, X } from "lucide-react";
import { chatTabId, type WorkspaceTab } from "@/entities/workspace";

export interface TabsBarProps {
  tabs: WorkspaceTab[];
  active: string;
  /** 聊天 tab 标签（当前会话名） */
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  /** 拖拽调序（moveTab 纯函数——from 拖到 to 位置） */
  onMove: (fromId: string, toId: string) => void;
  /** 拖拽开始/结束通知（02 分区：拖出 tab 到主区——null = 拖拽结束） */
  onDragStartTab?: (id: string | null) => void;
  /** 空栏 drop（03：拖 tab 到空组的 tab 栏——追加到该组末尾） */
  onDropTab?: (fromId: string) => void;
  /** 外部拖拽中的 tab（03 跨组移动——App 状态；拖拽源组与目标组共享） */
  dragId?: string | null;
}

export function TabsBar({ tabs, active, onActivate, onClose, onMove, onDragStartTab, onDropTab, dragId }: TabsBarProps) {
  const dragRef = useRef<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  return (
    <div
      role="tablist"
      className="scrollbar-none flex h-9 shrink-0 items-stretch overflow-x-auto border-b"
      onDragOver={(e) => {
        // 阻止冒泡到 SplitView 的 leaf 容器（tab 上的拖拽不应触发分区）；空栏可 drop（拖入本组）
        e.stopPropagation();
        if (tabs.length === 0 && (dragRef.current ?? dragId)) e.preventDefault();
      }}
      onDrop={(e) => {
        e.stopPropagation();
        const from = dragRef.current ?? dragId ?? null;
        if (tabs.length === 0 && from) {
          e.preventDefault();
          onDropTab?.(from);
          dragRef.current = null;
          setOverId(null);
        }
      }}
    >
      {tabs.map((tab) => {
        const id = tab.kind === "chat" ? chatTabId(tab.sessionId) : tab.kind === "diff" ? `diff:${tab.path}` : tab.path;
        const isActive = active === id;
        const isOver = overId === id;
        const label = tab.name;
        return (
          <div
            key={id}
            role="tab"
            draggable
            aria-selected={isActive}
            onDragStart={(e) => {
              dragRef.current = id;
              e.dataTransfer.effectAllowed = "move";
              onDragStartTab?.(id);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              const from = dragRef.current ?? dragId ?? null;
              if (from && from !== id) setOverId(id);
            }}
            onDragLeave={() => setOverId((o) => (o === id ? null : o))}
            onDrop={(e) => {
              e.preventDefault();
              const from = dragRef.current ?? dragId ?? null;
              if (from && from !== id) onMove(from, id);
              dragRef.current = null;
              setOverId(null);
            }}
            onDragEnd={() => {
              dragRef.current = null;
              setOverId(null);
              onDragStartTab?.(null);
            }}
            className={`flex max-w-48 shrink-0 cursor-pointer items-center gap-1.5 border-r px-3 text-xs ${
              isActive ? "bg-background text-foreground shadow-[inset_0_2px_0_0_var(--primary)]" : "bg-muted/40 text-muted-foreground hover:bg-muted/60"
            } ${isOver ? "ring-primary/50 ring-2 ring-inset" : ""}`}
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
    </div>
  );
}
