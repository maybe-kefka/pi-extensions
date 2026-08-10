import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, GitBranch, MoreHorizontal, RefreshCw } from "lucide-react";
import { Button } from "@/shared/ui/button";
import type { RpcClient } from "@/shared/api/rpc";

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
          <div className="text-muted-foreground py-1 text-[11px]">加载中…（工作区变更区：04）</div>
        </div>
      )}
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
