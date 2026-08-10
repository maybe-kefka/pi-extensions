/**
 * git 状态信息（entities/files）：对应服务端 pi:gitInfo 响应。
 */

export interface GitInfoDto {
  isRepo: boolean;
  repoRoot?: string;
  branch?: string;
  worktree?: boolean;
}

/** 状态条展示文本（纯函数）：非仓库 / 仓库+分支 / 仓库+分支+worktree */
export function gitStatusLabel(info: GitInfoDto | null): string {
  if (!info) return "…";
  if (!info.isRepo) return "非 git 仓库";
  const parts = [info.branch ?? "HEAD"];
  if (info.repoRoot) parts.push(info.repoRoot);
  if (info.worktree) parts.push("worktree");
  return parts.join(" · ");
}
