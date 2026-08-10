import { useCallback, useEffect, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, ChevronDown, ChevronRight, CirclePlus, GitBranch, MoreHorizontal, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import type { RpcClient } from "@/shared/api/rpc";

export interface GitStatusEntry {
  path: string;
  status: string;
  staged: boolean;
}

export interface GitPanelProps {
  request: RpcClient["request"];
  /** 展开区点击文件 → 打开 tab（App 注入；06 diff 挂接） */
  onOpenFile?: (path: string) => void;
}

export interface RepoInfo {
  root: string;
  name: string;
  branch: string | null;
  ahead: number;
  behind: number;
}

/** 单仓库 brief 行 + 展开体（04 填充展开区 / 05 填充 popover） */
export function RepoItem({
  repo,
  request,
  onOpenFile,
}: {
  repo: RepoInfo;
  request: RpcClient["request"];
  onOpenFile?: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [status, setStatus] = useState<GitStatusEntry[]>([]);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");
  const [committing, setCommitting] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);

  const refreshStatus = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const r = await request<{ isRepo: boolean; entries: GitStatusEntry[] }>("pi:gitStatus", { repoRoot: repo.root });
      setStatus(r.entries ?? []);
    } catch {
      setStatus([]);
    } finally {
      setLoadingStatus(false);
    }
  }, [request, repo.root]);

  // 展开时拉取工作区状态（折叠再展开重拉）
  useEffect(() => {
    if (expanded) void refreshStatus();
  }, [expanded, refreshStatus]);

  const refreshBrief = useCallback(async () => {
    setRefreshing(true);
    try {
      const r = await request<{ repos: RepoInfo[] }>("pi:gitRepos");
      const fresh = r.repos.find((x) => x.root === repo.root);
      if (fresh) {
        repo.branch = fresh.branch;
        repo.ahead = fresh.ahead;
        repo.behind = fresh.behind;
      }
    } catch {
      /* 静默 */
    } finally {
      setRefreshing(false);
    }
    // 强制重渲染（repo 对象就地更新）
    setExpanded((e) => e);
  }, [request, repo]);

  const stagePath = useCallback(
    async (path: string | null) => {
      try {
        await request("pi:gitStage", path ? { path, repoRoot: repo.root } : { all: true, repoRoot: repo.root });
        await refreshStatus();
        await refreshBrief();
      } catch (e) {
        toast.error(`暂存失败：${e instanceof Error ? e.message : String(e)}`);
      }
    },
    [request, repo.root, refreshStatus, refreshBrief],
  );

  const unstagePath = useCallback(
    async (path: string) => {
      try {
        await request("pi:gitUnstage", { path, repoRoot: repo.root });
        await refreshStatus();
        await refreshBrief();
      } catch (e) {
        toast.error(`取消暂存失败：${e instanceof Error ? e.message : String(e)}`);
      }
    },
    [request, repo.root, refreshStatus, refreshBrief],
  );

  const commit = useCallback(
    async (forceAll: boolean) => {
      const message = commitMessage.trim();
      if (message === "" || committing) return;
      const staged = status.filter((s) => s.staged);
      if (staged.length === 0 && !forceAll) {
        setConfirmAll(true);
        return;
      }
      setCommitting(true);
      try {
        if (staged.length === 0) {
          // 无 staged：确认后提交全部工作区文件
          await request("pi:gitStage", { all: true, repoRoot: repo.root });
        }
        await request("pi:gitCommit", { message, repoRoot: repo.root });
        toast.success("已提交");
        setCommitMessage("");
        setConfirmAll(false);
        await refreshStatus();
        await refreshBrief();
      } catch (e) {
        toast.error(`提交失败：${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setCommitting(false);
      }
    },
    [commitMessage, committing, status, request, repo.root, refreshStatus, refreshBrief],
  );

  const unstaged = status.filter((s) => !s.staged);
  const staged = status.filter((s) => s.staged);

  return (
    <div className="border-border border-b">
      <div className="flex items-center gap-1.5 px-2 py-1.5 text-xs">
        <button
          className="hover:bg-muted cursor-pointer rounded p-0.5"
          title={expanded ? "折叠" : "展开"}
          onClick={() => setExpanded((e) => !e)}
        >
          {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        </button>
        <GitBranch className="text-muted-foreground size-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate font-medium">{repo.name}</span>
        {repo.branch && <span className="bg-muted text-muted-foreground rounded px-1 py-0.5 font-mono text-[10px]">{repo.branch}</span>}
        {repo.behind > 0 && (
          <span className="text-blue-600 dark:text-blue-400 shrink-0 font-mono text-[10px]" title={`可拉取 ${repo.behind}`}>
            ↓{repo.behind}
          </span>
        )}
        {repo.ahead > 0 && (
          <span className="text-green-600 dark:text-green-400 shrink-0 font-mono text-[10px]" title={`可推送 ${repo.ahead}`}>
            ↑{repo.ahead}
          </span>
        )}
        <button className="hover:bg-muted cursor-pointer rounded p-0.5" title="刷新" onClick={() => void refreshBrief()}>
          <RefreshCw className={refreshing ? "animate-spin" : ""} />
        </button>
        <button className="hover:bg-muted cursor-pointer rounded p-0.5" title="更多操作">
          <MoreHorizontal />
        </button>
      </div>
      {expanded && (
        <div className="pb-2 pl-7 pr-2">
          {(staged.length > 0 || unstaged.length > 0) && (
            <div className="mb-1.5 flex items-center gap-1.5">
              <textarea
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                placeholder="提交信息（Ctrl+Enter）"
                rows={2}
                className="border-input bg-background text-foreground placeholder:text-muted-foreground min-h-0 flex-1 resize-none rounded border px-2 py-1 text-[11px] outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void commit(false);
                }}
              />
              <Button
                size="sm"
                className="h-7 shrink-0 text-[11px]"
                disabled={commitMessage.trim() === "" || committing}
                onClick={() => void commit(false)}
              >
                {committing ? "提交中…" : "提交"}
              </Button>
            </div>
          )}

          {loadingStatus && <div className="text-muted-foreground py-1 text-[11px]">加载中…</div>}
          {!loadingStatus && status.length === 0 && (
            <div className="text-muted-foreground py-1 text-[11px]">工作区干净</div>
          )}

          {unstaged.length > 0 && (
            <div className="mb-1">
              <div className="text-muted-foreground flex items-center gap-1 py-0.5 text-[10px] font-semibold tracking-wide uppercase">
                未暂存（{unstaged.length}）
                <button className="hover:text-foreground ml-auto cursor-pointer" title="全部暂存" onClick={() => void stagePath(null)}>
                  <CirclePlus className="size-3" />
                </button>
              </div>
              {unstaged.map((e) => (
                <div key={e.path} className="group flex items-center gap-1.5 py-0.5 text-[11px]">
                  <span className="text-muted-foreground w-3 shrink-0 font-mono text-[10px]">M</span>
                  <span
                    className="hover:text-primary min-w-0 flex-1 cursor-pointer truncate"
                    title={e.path}
                    onClick={() => onOpenFile?.(e.path)}
                  >
                    {e.path}
                  </span>
                  <button title="暂存" className="hover:text-foreground text-muted-foreground shrink-0 cursor-pointer p-0.5" onClick={() => void stagePath(e.path)}>
                    <ArrowUpFromLine className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {staged.length > 0 && (
            <div>
              <div className="text-muted-foreground flex items-center gap-1 py-0.5 text-[10px] font-semibold tracking-wide uppercase">
                已暂存（{staged.length}）
                <button className="hover:text-foreground ml-auto cursor-pointer" title="全部取消暂存" onClick={() => void unstagePath(".")}>
                  <ArrowDownToLine className="size-3" />
                </button>
              </div>
              {staged.map((e) => (
                <div key={e.path} className="group flex items-center gap-1.5 py-0.5 text-[11px]">
                  <span className="text-primary w-3 shrink-0 font-mono text-[10px]">A</span>
                  <span
                    className="hover:text-primary min-w-0 flex-1 cursor-pointer truncate"
                    title={e.path}
                    onClick={() => onOpenFile?.(e.path)}
                  >
                    {e.path}
                  </span>
                  <button title="取消暂存" className="hover:text-foreground text-muted-foreground shrink-0 cursor-pointer p-0.5" onClick={() => void unstagePath(e.path)}>
                    <ArrowDownToLine className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <Dialog open={confirmAll} onOpenChange={(open) => !open && setConfirmAll(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>提交所有工作区文件？</DialogTitle>
            <DialogDescription>没有已暂存的文件——将先把所有未暂存改动加入暂存区再提交。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmAll(false)}>
              取消
            </Button>
            <Button onClick={() => void commit(true)}>确认提交全部</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** git 控制面板：多仓库列表（发现 + brief；展开区/工具栏后续票填充） */
export function GitPanel({ request, onOpenFile }: GitPanelProps) {
  const [repos, setRepos] = useState<RepoInfo[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await request<{ repos: RepoInfo[] }>("pi:gitRepos");
      setRepos(r.repos);
    } catch {
      setRepos([]);
    } finally {
      setLoading(false);
    }
  }, [request]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-1.5">
        <GitBranch className="text-muted-foreground size-4" />
        <span className="text-sm font-semibold">git 控制</span>
        <span className="text-muted-foreground text-[11px]">{repos.length} 仓库</span>
        <Button variant="ghost" size="icon" className="ml-auto size-7" title="重新扫描仓库" onClick={() => void refresh()}>
          <RefreshCw className={loading ? "animate-spin" : ""} />
        </Button>
      </div>
      <div className="scrollbar-thin scrollbar-gutter-stable min-h-0 flex-1 overflow-y-auto py-1">
        {repos.length === 0 ? (
          <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-xs">
            <GitBranch className="size-6" />
            <div>未找到 git 仓库</div>
          </div>
        ) : (
          repos.map((repo) => (
            <RepoItem key={repo.root} repo={repo} request={request} onOpenFile={onOpenFile} />
          ))
        )}
      </div>
    </div>
  );
}
