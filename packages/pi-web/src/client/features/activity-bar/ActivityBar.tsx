import { FileCode2, GitBranch, MessageSquareText, Settings } from "lucide-react";

export type ActivityPanel = "files" | "git" | "sessions" | "settings";

export interface ActivityBarProps {
  /** 当前展开面板（null = 全部收起） */
  active: ActivityPanel | null;
  onSelect: (panel: ActivityPanel | null) => void;
}

const MAIN_ITEMS: { id: ActivityPanel; title: string; icon: React.ReactNode }[] = [
  { id: "files", title: "文件浏览", icon: <FileCode2 aria-hidden="true" /> },
  { id: "git", title: "git 控制", icon: <GitBranch aria-hidden="true" /> },
  { id: "sessions", title: "会话管理", icon: <MessageSquareText aria-hidden="true" /> },
];

const BOTTOM_ITEM: { id: ActivityPanel; title: string; icon: React.ReactNode } = {
  id: "settings",
  title: "设置",
  icon: <Settings aria-hidden="true" />,
};

/** vscode 式 activity bar：主功能图标 + 底部设置，点击展开/收起/互斥切换 */
export function ActivityBar({ active, onSelect }: ActivityBarProps) {
  const renderItem = (item: { id: ActivityPanel; title: string; icon: React.ReactNode }) => {
    const isActive = active === item.id;
    return (
      <button
        key={item.id}
        type="button"
        aria-label={item.title}
        aria-pressed={isActive}
        title={item.title}
        className={`focus-visible:ring-ring focus-visible:ring-2 flex size-9 cursor-pointer items-center justify-center rounded-md transition-[background-color,color,box-shadow] duration-150 ${
          isActive ? "bg-active text-accent-foreground before:bg-primary relative before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:rounded-full" : "text-muted-foreground hover:bg-hover hover:text-foreground"
        }`}
        onClick={() => onSelect(isActive ? null : item.id)}
      >
        {item.icon}
      </button>
    );
  };
  return (
    <nav aria-label="工作区工具" className="border-border bg-muted/30 flex w-12 shrink-0 flex-col items-center gap-1 border-r py-2">
      {MAIN_ITEMS.map(renderItem)}
      <div className="mt-auto">{renderItem(BOTTOM_ITEM)}</div>
    </nav>
  );
}
