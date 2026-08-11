import { FileDiff, MessageSquareText, Save, X } from "lucide-react";
import { chatTabId, type WorkspaceTab } from "@/entities/workspace/tabs";

export interface TabsBarProps {
  tabs: WorkspaceTab[];
  active: string;
  /** 聊天 tab 标签（当前会话名） */
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  /** 保存当前文件（激活文件 tab dirty 时显示） */
  onSave: () => void;
}

export function TabsBar({ tabs, active, onActivate, onClose, onSave }: TabsBarProps) {
  const activeFileDirty = tabs.some((t) => t.kind === "file" && t.path === active && t.dirty);
  return (
    <div className="scrollbar-none flex h-9 shrink-0 items-stretch overflow-x-auto border-b">
      {tabs.map((tab) => {
        const id = tab.kind === "chat" ? chatTabId(tab.sessionId) : tab.kind === "diff" ? `diff:${tab.path}` : tab.path;
        const isActive = active === id;
        const label = tab.name;
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
      {activeFileDirty && (
        <button
          className="bg-primary/10 text-primary hover:bg-primary/20 ml-1 flex shrink-0 cursor-pointer items-center gap-1 self-center rounded px-2 py-1 text-xs font-medium"
          onClick={onSave}
          title="保存当前文件 (Ctrl+S)"
        >
          <Save className="size-3.5" />
          保存
        </button>
      )}
    </div>
  );
}
