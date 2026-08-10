import { FileCode2, GitBranch, MessageSquareText, Settings } from "lucide-react";

export type ActivityPanel = "files" | "git" | "sessions" | "settings";

export interface ActivityBarProps {
  /** 当前展开面板（null = 全部收起） */
  active: ActivityPanel | null;
  onSelect: (panel: ActivityPanel | null) => void;
}

const ITEMS: { id: ActivityPanel; title: string; icon: React.ReactNode }[] = [
  { id: "files", title: "文件浏览", icon: <FileCode2 /> },
  { id: "git", title: "git 控制", icon: <GitBranch /> },
  { id: "sessions", title: "会话管理", icon: <MessageSquareText /> },
  { id: "settings", title: "设置", icon: <Settings /> },
];

/** vscode 式 activity bar：竖排图标，点击展开/收起/互斥切换 */
export function ActivityBar({ active, onSelect }: ActivityBarProps) {
  return (
    <nav className="border-border bg-muted/30 flex w-12 shrink-0 flex-col items-center gap-1 border-r py-2">
      {ITEMS.map((item) => {
        const isActive = active === item.id;
        return (
          <button
            key={item.id}
            aria-selected={isActive}
            title={item.title}
            className={`flex size-9 cursor-pointer items-center justify-center rounded-md transition-colors ${
              isActive ? "text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
            onClick={() => onSelect(isActive ? null : item.id)}
          >
            {item.icon}
          </button>
        );
      })}
    </nav>
  );
}
