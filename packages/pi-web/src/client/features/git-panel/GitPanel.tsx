import { useCallback, useEffect, useState } from "react";
import { Check, GitBranch, GitMerge, GitPullRequest, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import type { RpcClient } from "@/shared/api/rpc";

export interface GitPanelProps {
  request: RpcClient["request"];
}

type BranchOp = { kind: "merge" | "rebase" | "delete"; branch: string };

/** git 控制面板：分支管理（vscode-align 05a；staging/commit/push/stash 后续票扩展） */
export function GitPanel({ request }: GitPanelProps) {
  const [branches, setBranches] = useState<string[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [isRepo, setIsRepo] = useState(true);
  const [switching, setSwitching] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newBranch, setNewBranch] = useState("");
  const [confirmOp, setConfirmOp] = useState<BranchOp | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await request<{ isRepo: boolean; current: string | null; branches: string[] }>("pi:gitBranches");
      setIsRepo(r.isRepo);
      setCurrent(r.current);
      setBranches(r.branches);
    } catch {
      setIsRepo(false);
    }
  }, [request]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const switchTo = useCallback(
    async (branch: string) => {
      if (branch === current) return;
      setSwitching(branch);
      try {
        await request("pi:gitSwitch", { branch });
        toast.success(`已切换到 ${branch}`);
        void refresh();
      } catch (e) {
        toast.error(`切换失败：${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setSwitching(null);
      }
    },
    [request, refresh, current],
  );

  const createBranch = useCallback(async () => {
    const name = newBranch.trim();
    setCreating(false);
    setNewBranch("");
    if (name === "") return;
    try {
      await request("pi:gitBranchCreate", { name });
      toast.success(`已创建分支 ${name}`);
      void refresh();
    } catch (e) {
      toast.error(`创建失败：${e instanceof Error ? e.message : String(e)}`);
    }
  }, [newBranch, request, refresh]);

  const runConfirmOp = useCallback(async () => {
    if (!confirmOp) return;
    const { branch, kind } = confirmOp;
    setConfirmOp(null);
    try {
      await request(kind === "merge" ? "pi:gitMerge" : kind === "rebase" ? "pi:gitRebase" : "pi:gitBranchDelete", {
        branch,
      });
      toast.success(`${kind === "merge" ? "已合并" : kind === "rebase" ? "已 rebase" : "已删除分支"} ${branch}`);
      void refresh();
    } catch (e) {
      toast.error(`${kind === "merge" ? "合并" : kind === "rebase" ? "Rebase" : "删除"}失败：${e instanceof Error ? e.message : String(e)}`);
    }
  }, [confirmOp, request, refresh]);

  const openConfirm = (op: Omit<BranchOp, "branch">, branch: string) => {
    setConfirmOp({ ...op, branch });
  };

  if (!isRepo) {
    return (
      <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-xs">
        <GitBranch className="size-6" />
        <div>当前目录不是 git 仓库</div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-1.5">
        <GitBranch className="text-muted-foreground size-4" />
        <span className="text-sm font-semibold">git 控制</span>
        <span className="bg-muted text-muted-foreground truncate rounded px-1.5 py-0.5 font-mono text-[11px]">{current}</span>
        <Button variant="ghost" size="icon" className="ml-auto size-7" title="新建分支" onClick={() => setCreating(true)}>
          <Plus />
        </Button>
      </div>
      <div className="scrollbar-thin scrollbar-gutter-stable min-h-0 flex-1 overflow-y-auto p-2">
        {branches.map((branch) => {
          const isCurrent = branch === current;
          return (
            <div
              key={branch}
              className={`group flex items-center gap-1.5 rounded px-2 py-1.5 text-xs ${isCurrent ? "bg-primary/10 text-primary" : "hover:bg-muted/60 cursor-pointer"}`}
              onClick={() => !isCurrent && void switchTo(branch)}
              title={isCurrent ? "当前分支" : `切换到 ${branch}`}
            >
              {isCurrent ? <Check className="size-3.5 shrink-0" /> : <GitBranch className="text-muted-foreground size-3.5 shrink-0" />}
              <span className="truncate">{branch}</span>
              <span className="bg-background invisible ml-auto flex items-center gap-0.5 group-hover:visible">
                {!isCurrent && (
                  <>
                    <button title="合并到当前分支" className="hover:text-foreground cursor-pointer p-0.5" onClick={(e) => { e.stopPropagation(); openConfirm({ kind: "merge" }, branch); }}>
                      <GitMerge className="size-3.5" />
                    </button>
                    <button title="rebase 到当前分支" className="hover:text-foreground cursor-pointer p-0.5" onClick={(e) => { e.stopPropagation(); openConfirm({ kind: "rebase" }, branch); }}>
                      <GitPullRequest className="size-3.5" />
                    </button>
                    <button title="删除分支" className="hover:text-destructive cursor-pointer p-0.5" onClick={(e) => { e.stopPropagation(); openConfirm({ kind: "delete" }, branch); }}>
                      <Trash2 className="size-3.5" />
                    </button>
                  </>
                )}
              </span>
              {switching === branch && <span className="text-muted-foreground">…</span>}
            </div>
          );
        })}
      </div>

      <Dialog open={creating} onOpenChange={(open) => !open && setCreating(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建分支</DialogTitle>
            <DialogDescription>从当前 HEAD 创建（不自动切换）</DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={newBranch}
            placeholder="分支名"
            onChange={(e) => setNewBranch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void createBranch();
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(false)}>
              取消
            </Button>
            <Button disabled={newBranch.trim() === ""} onClick={() => void createBranch()}>
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmOp !== null} onOpenChange={(open) => !open && setConfirmOp(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmOp?.kind === "merge"
                ? `将 ${confirmOp?.branch ?? ""} 合并到 ${current}？`
                : confirmOp?.kind === "rebase"
                  ? `将当前分支 rebase 到 ${confirmOp?.branch ?? ""}？`
                  : `删除分支 ${confirmOp?.branch ?? ""}？`}
            </DialogTitle>
            <DialogDescription>
              {confirmOp?.kind === "merge"
                ? "合并会改动当前分支历史。"
                : confirmOp?.kind === "rebase"
                  ? "Rebase 会重写当前分支提交历史。"
                  : "已合并的分支可安全删除；未合并分支将被拒绝。"}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOp(null)}>
              取消
            </Button>
            <Button variant={confirmOp?.kind === "delete" ? "destructive" : "default"} onClick={() => void runConfirmOp()}>
              确认
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
