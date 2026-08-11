import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpCircle,
  ArrowUpFromLine,
  Check,
  ChevronDown,
  Cloud,
  ChevronRight,
  CirclePlus,
  GitBranch,
  GitMerge,
  GitPullRequest,
  MoreHorizontal,
  PackageOpen,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import { statusMarker } from "@/entities/files/git-status";
import type { RpcClient } from "@/shared/api/rpc";

export interface GitStatusEntry {
  path: string;
  status: string;
  staged: boolean;
}

export interface GitPanelProps {
  request: RpcClient["request"];
  /** 展开区点击文件 → 打开 tab（App 注入；带 repoRoot 供 diff 使用） */
  onOpenFile?: (path: string, repoRoot: string) => void;
  /** 保存成功后递增（联动刷新展开区状态） */
  gitRefreshKey?: number;
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
  onBriefRefresh,
  gitRefreshKey = 0,
}: {
  repo: RepoInfo;
  request: RpcClient["request"];
  onOpenFile?: (path: string, repoRoot: string) => void;
  /** 刷新后的 brief 上报（父级更新 repos state——不 mutate props） */
  onBriefRefresh?: (root: string, brief: { branch: string | null; ahead: number; behind: number }) => void;
  /** 保存成功后递增（联动刷新展开区状态） */
  gitRefreshKey?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [status, setStatus] = useState<GitStatusEntry[]>([]);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");
  const [committing, setCommitting] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);
  const [branches, setBranches] = useState<string[]>([]);
  const [remotes, setRemotes] = useState<string[]>([]);
  const [currentBranch, setCurrentBranch] = useState<string | null>(null);
  const [creatingBranch, setCreatingBranch] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");
  const [confirmOp, setConfirmOp] = useState<{ kind: "merge" | "rebase" | "delete"; branch: string } | null>(null);
  const [toolOpen, setToolOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const commitAreaRef = useRef<HTMLTextAreaElement>(null);
  const [pickerQuery, setPickerQuery] = useState("");
  const [pickerStep, setPickerStep] = useState<"list" | "create">("list");
  const [selectedBase, setSelectedBase] = useState<string | null>(null);

  const refreshBrief = useCallback(async () => {
    setRefreshing(true);
    try {
      const r = await request<{ repos: RepoInfo[] }>("pi:gitRepos");
      const fresh = r.repos.find((x) => x.root === repo.root);
      if (fresh) onBriefRefresh?.(repo.root, { branch: fresh.branch, ahead: fresh.ahead, behind: fresh.behind });
    } catch {
      /* 静默 */
    } finally {
      setRefreshing(false);
    }
  }, [request, repo.root, onBriefRefresh]);

  const loadBranches = useCallback(async () => {
    try {
      const r = await request<{ isRepo: boolean; current: string | null; branches: string[]; remotes: string[] }>("pi:gitBranches", { repoRoot: repo.root });
      setCurrentBranch(r.current);
      setBranches(r.branches);
      setRemotes(r.remotes ?? []);
    } catch {
      setBranches([]);
      setRemotes([]);
    }
  }, [request, repo.root]);

  const switchBranch = useCallback(
    async (branch: string) => {
      try {
        await request("pi:gitSwitch", { branch, repoRoot: repo.root });
        toast.success(`已切换到 ${branch}`);
        await Promise.all([loadBranches(), refreshBrief()]);
      } catch (e) {
        toast.error(`切换失败：${e instanceof Error ? e.message : String(e)}`);
      }
    },
    [request, repo.root, loadBranches, refreshBrief],
  );

  const createBranch = useCallback(async () => {
    const name = newBranchName.trim();
    setCreatingBranch(false);
    setNewBranchName("");
    if (name === "") return;
    try {
      await request("pi:gitBranchCreate", { name, repoRoot: repo.root });
      toast.success(`已创建分支 ${name}`);
      await loadBranches();
    } catch (e) {
      toast.error(`创建失败：${e instanceof Error ? e.message : String(e)}`);
    }
  }, [newBranchName, request, repo.root, loadBranches]);

  const runBranchOp = useCallback(async () => {
    if (!confirmOp) return;
    const { kind, branch } = confirmOp;
    setConfirmOp(null);
    try {
      await request(kind === "merge" ? "pi:gitMerge" : kind === "rebase" ? "pi:gitRebase" : "pi:gitBranchDelete", { branch, repoRoot: repo.root });
      toast.success(`${kind === "merge" ? "已合并" : kind === "rebase" ? "已 rebase" : "已删除分支"} ${branch}`);
      await Promise.all([loadBranches(), refreshBrief()]);
    } catch (e) {
      toast.error(`${kind === "merge" ? "合并" : kind === "rebase" ? "Rebase" : "删除"}失败：${e instanceof Error ? e.message : String(e)}`);
    }
  }, [confirmOp, request, repo.root, loadBranches, refreshBrief]);

  const runRemote = useCallback(
    async (kind: "push" | "pull") => {
      try {
        await request(kind === "push" ? "pi:gitPush" : "pi:gitPull", { repoRoot: repo.root });
        toast.success(kind === "push" ? "已推送" : "已拉取");
        await refreshBrief();
      } catch (e) {
        toast.error(`${kind === "push" ? "推送" : "拉取"}失败：${e instanceof Error ? e.message : String(e)}`);
      }
    },
    [request, repo.root, refreshBrief],
  );

  const runStash = useCallback(
    async (action: "push" | "pop" | "apply" | "drop") => {
      try {
        await request(
          "pi:gitStash",
          action === "push" ? { action, message: `stash ${new Date().toISOString().slice(0, 16)}`, repoRoot: repo.root } : { action, repoRoot: repo.root },
        );
        toast.success(action === "push" ? "已暂存改动" : `已 ${action}`);
        await refreshBrief();
      } catch (e) {
        toast.error(`stash ${action} 失败：${e instanceof Error ? e.message : String(e)}`);
      }
    },
    [request, repo.root, refreshBrief],
  );

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

  // 展开时拉取工作区状态（折叠再展开重拉；保存后联动刷新）
  useEffect(() => {
    if (expanded) void refreshStatus();
  }, [expanded, refreshStatus, gitRefreshKey]);

  const afterBranchChange = useCallback(async () => {
    await loadBranches();
    await refreshBrief();
    if (expanded) await refreshStatus();
  }, [loadBranches, refreshBrief, expanded, refreshStatus]);

  const pickerSwitch = useCallback(
    async (branch: string, isRemote: boolean) => {
      try {
        if (isRemote) await request("pi:gitSwitchRemote", { remote: branch, repoRoot: repo.root });
        else await request("pi:gitSwitch", { branch, repoRoot: repo.root });
        toast.success(`已切换到 ${isRemote ? branch : branch}`);
        setPickerOpen(false);
        void afterBranchChange();
      } catch (e) {
        toast.error(`切换失败：${e instanceof Error ? e.message : String(e)}`);
      }
    },
    [request, repo.root, afterBranchChange],
  );

  const pickerCommitCreate = useCallback(async () => {
    const name = pickerQuery.trim();
    if (name === "" || !selectedBase) return;
    try {
      await request("pi:gitCreateBranch", { name, base: selectedBase, repoRoot: repo.root });
      toast.success(`已创建并切换到 ${name}`);
      setPickerOpen(false);
      void afterBranchChange();
    } catch (e) {
      toast.error(`创建失败：${e instanceof Error ? e.message : String(e)}`);
    }
  }, [pickerQuery, selectedBase, request, repo.root, afterBranchChange]);

  const pickerEnter = useCallback(() => {
    const q = pickerQuery.trim();
    if (q === "") return;
    // 精确匹配：本地/远程分支 → 直接切换
    if (branches.includes(q)) {
      void pickerSwitch(q, false);
      return;
    }
    if (remotes.includes(q)) {
      void pickerSwitch(q, true);
      return;
    }
    // 不存在 → 内联创建第二步
    setSelectedBase(null);
    setPickerStep("create");
  }, [pickerQuery, branches, remotes, pickerSwitch]);




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
        // 清空后重置 textarea 高度（auto-grow 的 inline style 残留会让框不折叠回一行）
        requestAnimationFrame(() => {
          const ta = commitAreaRef.current;
          if (ta) {
            ta.style.height = "auto";
            ta.style.height = `${ta.scrollHeight}px`;
          }
        });
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

  // 弹窗列表：输入过滤（大小写不敏感）
  const q = pickerQuery.trim().toLowerCase();
  const pickLocal = branches.filter((b) => b.toLowerCase().includes(q));
  const pickRemote = remotes.filter((r) => r.toLowerCase().includes(q));
  const pickBases = [...branches, ...remotes];
  // 输入精确匹配高亮（回车=切换该分支；否则回车进入创建）
  const exactMatch = q !== ""
    ? [...pickLocal, ...pickRemote].find((b) => b.toLowerCase() === q) ?? null
    : null;

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
        {repo.branch && (
          <button
            className="bg-muted text-muted-foreground hover:bg-primary/20 hover:text-primary cursor-pointer rounded px-1 py-0.5 font-mono text-[10px]"
            title={`当前分支 ${repo.branch}（点击选择）`}
            onClick={() => {
              setPickerOpen(true);
              void loadBranches();
            }}
          >
            {repo.branch}
          </button>
        )}
        <button className="hover:bg-muted cursor-pointer rounded p-0.5" title="刷新" onClick={() => void refreshBrief()}>
          <RefreshCw className={`size-3 ${refreshing ? "animate-spin" : ""}`} />
        </button>
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
        <Popover
          open={toolOpen}
          onOpenChange={(open) => {
            setToolOpen(open);
            if (open) void loadBranches();
          }}
        >
          <PopoverTrigger asChild>
            <button className="hover:bg-muted cursor-pointer rounded p-0.5" title="更多操作">
              <MoreHorizontal />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" side="right" className="w-64 p-2">
            <div className="mb-1 text-[10px] font-semibold tracking-wide uppercase">分支</div>
            <div className="scrollbar-thin mb-1 max-h-40 overflow-y-auto">
              {branches.map((branch) => {
                const isCurrent = branch === currentBranch;
                return (
                  <div
                    key={branch}
                    className={`group flex cursor-pointer items-center gap-1.5 rounded px-1.5 py-1 text-[11px] ${isCurrent ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}
                    onClick={() => !isCurrent && void switchBranch(branch)}
                    title={isCurrent ? "当前分支" : `切换到 ${branch}`}
                  >
                    {isCurrent ? <Check className="size-3 shrink-0" /> : <GitBranch className="text-muted-foreground size-3 shrink-0" />}
                    <span className="min-w-0 flex-1 truncate">{branch}</span>
                    {!isCurrent && (
                      <span className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
                        <button title="合并到当前分支" className="cursor-pointer p-0.5" onClick={(e) => { e.stopPropagation(); setConfirmOp({ kind: "merge", branch }); }}>
                          <GitMerge className="size-3" />
                        </button>
                        <button title="rebase 到当前分支" className="cursor-pointer p-0.5" onClick={(e) => { e.stopPropagation(); setConfirmOp({ kind: "rebase", branch }); }}>
                          <GitPullRequest className="size-3" />
                        </button>
                        <button title="删除分支" className="cursor-pointer p-0.5" onClick={(e) => { e.stopPropagation(); setConfirmOp({ kind: "delete", branch }); }}>
                          <Trash2 className="size-3" />
                        </button>
                      </span>
                    )}
                  </div>
                );
              })}
              {branches.length === 0 && <div className="text-muted-foreground px-1.5 py-1 text-[11px]">无分支</div>}
            </div>
            <div className="mb-2 flex items-center gap-1">
              <input
                value={newBranchName}
                onChange={(e) => setNewBranchName(e.target.value)}
                placeholder="新分支名"
                className="border-input bg-background min-w-0 flex-1 rounded border px-1.5 py-0.5 text-[11px] outline-none"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void createBranch();
                }}
              />
              <Button size="sm" className="h-6 shrink-0 px-1.5 text-[10px]" disabled={newBranchName.trim() === ""} onClick={() => void createBranch()}>
                <Plus className="size-3" />
                新建
              </Button>
            </div>

            <div className="mb-1 text-[10px] font-semibold tracking-wide uppercase">远程</div>
            <div className="mb-2 flex gap-1">
              <Button size="sm" variant="outline" className="h-6 flex-1 text-[11px]" onClick={() => void runRemote("pull")}>
                <ArrowDownToLine className="size-3" />
                拉取
              </Button>
              <Button size="sm" variant="outline" className="h-6 flex-1 text-[11px]" onClick={() => void runRemote("push")}>
                <ArrowUpCircle className="size-3" />
                推送
              </Button>
            </div>

            <div className="mb-1 text-[10px] font-semibold tracking-wide uppercase">stash</div>
            <div className="flex flex-wrap gap-1">
              <Button size="sm" variant="outline" className="h-6 text-[10px]" title="暂存全部改动" onClick={() => void runStash("push")}>
                <PackageOpen className="mr-0.5 size-3" />
                暂存
              </Button>
              <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => void runStash("pop")}>
                Pop
              </Button>
              <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => void runStash("apply")}>
                Apply
              </Button>
              <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => void runStash("drop")}>
                Drop
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
      {expanded && (
        <div className="pb-2 pl-7 pr-2">
          {(staged.length > 0 || unstaged.length > 0) && (
            <div className="mb-1.5 flex items-center gap-1.5">
              <textarea
                ref={commitAreaRef}
                value={commitMessage}
                onChange={(e) => {
                  setCommitMessage(e.target.value);
                  // auto-grow：内容高度自适应（一行收起，多行展开）
                  const el = e.target;
                  el.style.height = "auto";
                  el.style.height = `${el.scrollHeight}px`;
                }}
                placeholder="提交信息（Ctrl/Shift+Enter 提交）"
                rows={1}
                className="border-input bg-background text-foreground placeholder:text-muted-foreground max-h-32 min-h-0 flex-1 resize-none overflow-y-auto rounded border px-2 py-1 text-[11px] leading-4 outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                onKeyDown={(e) => {
                  // Enter 天然换行；Shift+Enter 与 Ctrl/Meta+Enter 提交（vscode 语义）
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey || e.shiftKey)) {
                    e.preventDefault();
                    void commit(false);
                  }
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
                  <span className="text-primary w-3 shrink-0 font-mono text-[10px]">{statusMarker(e.status)}</span>
                  <span
                    className="hover:text-primary min-w-0 flex-1 cursor-pointer truncate"
                    title={e.path}
                    onClick={() => onOpenFile?.(e.path, repo.root)}
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
                  <span className="text-muted-foreground w-3 shrink-0 font-mono text-[10px]">{statusMarker(e.status)}</span>
                  <span
                    className="hover:text-primary min-w-0 flex-1 cursor-pointer truncate"
                    title={e.path}
                    onClick={() => onOpenFile?.(e.path, repo.root)}
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
        </div>
      )}

      <Dialog
        open={pickerOpen}
        onOpenChange={(open) => {
          setPickerOpen(open);
          if (open) {
            setPickerQuery("");
            setPickerStep("list");
            setSelectedBase(null);
            void loadBranches();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>选择分支 · {repo.name}</DialogTitle>
            <DialogDescription>输入新名称回车可创建分支</DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={pickerQuery}
            onChange={(e) => {
              setPickerQuery(e.target.value);
              if (pickerStep === "create") setPickerStep("list");
            }}
            placeholder="分支名（输入新名回车创建）"
            onKeyDown={(e) => {
              if (e.key === "Enter") pickerEnter();
            }}
          />
          {pickerStep === "create" ? (
            <div className="mt-1">
              <div className="text-muted-foreground mb-1 text-[10px] font-semibold tracking-wide uppercase">从哪个分支创建「{pickerQuery.trim()}」？</div>
              <div className="scrollbar-thin max-h-40 overflow-y-auto">
                {pickBases.map((b) => (
                  <button
                    key={b}
                    className={`flex w-full cursor-pointer items-center gap-1.5 rounded px-1.5 py-1 text-left text-[11px] ${selectedBase === b ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}
                    onClick={() => setSelectedBase(b)}
                  >
                    <GitBranch className="text-muted-foreground size-3 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{b}</span>
                    {selectedBase === b && <Check className="size-3 shrink-0" />}
                  </button>
                ))}
              </div>
              <DialogFooter className="mt-2">
                <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => setPickerStep("list")}>
                  取消
                </Button>
                <Button size="sm" className="h-7 text-[11px]" disabled={!selectedBase} onClick={() => void pickerCommitCreate()}>
                  创建
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="mt-1">
              <div className="text-muted-foreground mb-1 text-[10px] font-semibold tracking-wide uppercase">本地分支</div>
              <div className="scrollbar-thin max-h-32 overflow-y-auto">
                {pickLocal.map((b) => {
                  const isCurrent = b === currentBranch;
                  const isExact = exactMatch === b;
                  return (
                    <button
                      key={b}
                      disabled={isCurrent}
                      title={isCurrent ? "当前分支" : `切换到 ${b}`}
                      className={`flex w-full cursor-pointer items-center gap-1.5 rounded px-1.5 py-1 text-left text-[11px] ${isCurrent ? "text-muted-foreground cursor-default opacity-60" : isExact ? "bg-primary/15 text-primary" : "hover:bg-muted"}`}
                      onClick={() => void pickerSwitch(b, false)}
                    >
                      {isCurrent ? <Check className="size-3 shrink-0" /> : <GitBranch className="text-muted-foreground size-3 shrink-0" />}
                      <span className="min-w-0 flex-1 truncate">{b}</span>
                    </button>
                  );
                })}
                {pickLocal.length === 0 && <div className="text-muted-foreground px-1.5 py-1 text-[11px]">无匹配分支</div>}
              </div>
              <div className="text-muted-foreground mt-2 mb-1 text-[10px] font-semibold tracking-wide uppercase">远程分支</div>
              <div className="scrollbar-thin max-h-32 overflow-y-auto">
                {pickRemote.map((r) => (
                  <button
                    key={r}
                    title={`创建跟踪分支并切换到 ${r}`}
                    className="hover:bg-muted flex w-full cursor-pointer items-center gap-1.5 rounded px-1.5 py-1 text-left text-[11px]"
                    onClick={() => void pickerSwitch(r, true)}
                  >
                    <Cloud className="text-muted-foreground size-3 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{r}</span>
                  </button>
                ))}
                {pickRemote.length === 0 && <div className="text-muted-foreground px-1.5 py-1 text-[11px]">无匹配远程分支</div>}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={confirmOp !== null} onOpenChange={(open) => !open && setConfirmOp(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmOp?.kind === "merge"
                ? `将 ${confirmOp.branch} 合并到 ${currentBranch ?? "当前分支"}？`
                : confirmOp?.kind === "rebase"
                  ? `将当前分支 rebase 到 ${confirmOp.branch}？`
                  : `删除分支 ${confirmOp?.branch}？`}
            </DialogTitle>
            <DialogDescription>
              {confirmOp?.kind === "delete" ? "未合并的分支将被 git 拒绝。" : "此操作将改动分支历史。"}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOp(null)}>
              取消
            </Button>
            <Button variant={confirmOp?.kind === "delete" ? "destructive" : "default"} onClick={() => void runBranchOp()}>
              确认
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
export function GitPanel({ request, onOpenFile, gitRefreshKey = 0 }: GitPanelProps) {
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

  const handleBriefRefresh = useCallback((root: string, brief: { branch: string | null; ahead: number; behind: number }) => {
    setRepos((prev) => prev.map((r) => (r.root === root ? { ...r, ...brief } : r)));
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b px-3">
        <GitBranch className="text-muted-foreground size-4" />
        <span className="text-sm font-semibold">源代码管理</span>
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
            <RepoItem key={repo.root} repo={repo} request={request} onOpenFile={onOpenFile} onBriefRefresh={handleBriefRefresh} gitRefreshKey={gitRefreshKey} />
          ))
        )}
      </div>
    </div>
  );
}
