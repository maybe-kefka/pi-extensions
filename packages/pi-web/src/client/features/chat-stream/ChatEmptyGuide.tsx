/** 空态引导：web 打开但无任何注册进程（TUI 里 /web 注册会话，或从侧边栏打开文件） */
export function ChatEmptyGuide() {
  return (
    <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-1 text-sm">
      <div>还没有会话</div>
      <div>
        在 pi 里运行 <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">/web</code> 注册当前会话
      </div>
      <div className="text-xs opacity-70">或从侧边栏打开文件</div>
    </div>
  );
}
