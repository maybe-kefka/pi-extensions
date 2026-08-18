import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/shared/ui";

/** 空态引导：web 打开但无任何注册进程（TUI 里 /web 注册会话，或从侧边栏打开文件） */
export function ChatEmptyGuide() {
  return (
    <Empty className="h-full border-0 p-6">
      <EmptyHeader>
        <EmptyTitle>工作区已就绪</EmptyTitle>
        <EmptyDescription>
          在 pi 里运行 <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">/web</code> 注册当前会话，或从侧边栏打开文件。
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
