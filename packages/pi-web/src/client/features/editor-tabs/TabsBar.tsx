import { FileCode2, MessageSquareText, X } from "lucide-react";
import type { WorkspaceTab } from "@/entities/workspace/tabs";

export interface TabsBarProps {
  tabs: WorkspaceTab[];
  active: string;
  /** 聊天 tab 标签（当前会话名） */
  sessionName: string;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  /** 文件浏览入口（无文件 tab 时） */
  onOpenFiles: () => void;
}

export function TabsBar({ tabs, active, sessionName, onActivate, onClose, onOpenFiles }: TabsBarProps) {
  return (
    <div className="scrollbar-none flex h-9 shrink-0 items-stretch overflow-x-auto border-b">
      {tabs.map((tab) => {
        const id = tab.kind === "chat" ? "chat" : tab.path;
        const isActive = active === id;
        const label = tab.kind === "chat" ? sessionName : tab.name;
        return (
          <div
            key={id}
            role="tab"
            aria-selected={isActive}
            className={`flex max-w-48 shrink-0 cursor-pointer items-center gap-1.5 border-r px-3 text-xs ${
              isActive ? "bg-background text-foreground shadow-[inset_0_2px_0_0_var(--primary)]" : "bg-muted/40 text-muted-foreground hover:bg-muted/60"
            }`}
            onClick={() => onActivate(id)}
            title={tab.kind === "chat" ? "聊天" : id}
          >
            {tab.kind === "chat" && <MessageSquareText className="size-3.5 shrink-0" />}
            <span className="truncate">{label}</span>
            {tab.kind === "file" && (
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
            )}
          </div>
        );
      })}
      <button
        className="hover:bg-muted text-muted-foreground hover:text-foreground ml-1 flex shrink-0 cursor-pointer items-center gap-1 self-center rounded px-2 py-1 text-xs"
        onClick={onOpenFiles}
        title="打开文件"
      >
        <FileCode2 className="size-3.5" />
        文件
      </button>
    </div>
  );
}
