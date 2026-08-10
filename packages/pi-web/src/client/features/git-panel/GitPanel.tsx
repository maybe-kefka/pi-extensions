import { GitBranch } from "lucide-react";

/** git 控制面板（vscode-align 05 实现：分支/staging/commit/push/stash） */
export function GitPanel() {
  return (
    <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-xs">
      <GitBranch className="size-6" />
      <div>git 控制面板（开发中）</div>
      <div className="max-w-44">分支切换 / 暂存提交 / 推送拉取 / stash</div>
    </div>
  );
}
