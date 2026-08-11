import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FolderTree, RefreshCw } from "lucide-react";
import { Button } from "@/shared/ui";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/shared/ui";
import { Input } from "@/shared/ui";
import { toast } from "sonner";
import type { RpcClient } from "@/shared/api";
import {
  applyListing,
  collapseDir,
  createRootTree,
  findNode,
  setDirState,
  type DirEntryDto,
  type TreeState,
} from "@/entities/files";
import { gitStatusLabel, type GitInfoDto } from "@/entities/files";
import { TreeView } from "./TreeView";

export interface FilesTreeProps {
  request: RpcClient["request"];
  /** 打开文件（App 层进入 tab 系统；preview=单击预览） */
  onOpenFile: (path: string, name: string, preview: boolean) => void;
  /** 当前激活文件（树高亮） */
  activePath: string | null;
  /** 外部刷新信号（保存文件后递增，联动刷新 git 状态） */
  gitRefreshKey?: number;
  /** 右键菜单：打开 diff（App 注入 open-diff） */
  onOpenDiff?: (path: string) => void;
}

/** 文件浏览树面板（目录树 + git 状态标记 + 新建/重命名/删除 + 键盘导航） */
export function FilesTree({ request, onOpenFile, activePath, gitRefreshKey = 0, onOpenDiff }: FilesTreeProps) {
  const [tree, setTree] = useState<TreeState>(() => createRootTree());
  const [gitInfo, setGitInfo] = useState<GitInfoDto | null>(null);
  const [gitStatus, setGitStatus] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleteCount, setDeleteCount] = useState<number | null>(null);
  const [newTarget, setNewTarget] = useState<{ dir: string; type: "file" | "dir" } | null>(null);
  const [newName, setNewName] = useState("");
  const inflight = useRef(new Set<string>());

  const loadDir = useCallback(
    async (path: string): Promise<void> => {
      if (inflight.current.has(path)) return;
      inflight.current.add(path);
      setTree((prev) => setDirState(prev, path, { loading: true }));
      try {
        const { entries } = await request<{ entries: DirEntryDto[] }>("pi:listDir", {
          path,
        });
        setTree((prev) => applyListing(prev, path, entries));
      } catch (e) {
        setTree((prev) => setDirState(prev, path, { loading: false, error: true }));
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        inflight.current.delete(path);
      }
    },
    [request],
  );

  const loadGitStatus = useCallback(async () => {
    try {
      const r = await request<{ isRepo: boolean; aggregated: Record<string, string> }>("pi:gitStatus");
      setGitStatus(new Map(Object.entries(r.aggregated ?? {})));
    } catch {
      setGitStatus(new Map());
    }
  }, [request]);

  // 首屏加载根目录 + git 信息与状态
  useEffect(() => {
    void loadDir("");
    request<GitInfoDto>("pi:gitInfo")
      .then(setGitInfo)
      .catch(() => setGitInfo({ isRepo: false }));
    void loadGitStatus();
  }, [loadDir]);

  // 外部刷新信号（保存后联动）
  useEffect(() => {
    if (gitRefreshKey > 0) void loadGitStatus();
  }, [gitRefreshKey, loadGitStatus]);

  const toggleDir = useCallback(
    (path: string) => {
      const node = findNode(tree.nodes, path);
      if (!node) return;
      if (node.children !== null) {
        setTree((prev) => collapseDir(prev, path));
      } else {
        void loadDir(path);
      }
    },
    [tree, loadDir],
  );

  const refresh = useCallback(() => {
    setError(null);
    const fresh = createRootTree();
    setTree(fresh);
    void loadDir("");
    void loadGitStatus();
  }, [loadDir, loadGitStatus]);

  const commitRename = useCallback(
    async (path: string, newName: string) => {
      setRenaming(null);
      const trimmed = newName.trim();
      if (trimmed === "" || trimmed === path.split("/").pop()) return;
      try {
        await request("pi:rename", { path, newName: trimmed });
        // 重命名后重载父目录
        const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
        void loadDir(dir);
        void loadGitStatus();
      } catch (e) {
        toast.error(`重命名失败：${e instanceof Error ? e.message : String(e)}`);
      }
    },
    [request, tree, loadDir, loadGitStatus],
  );

  const doDelete = useCallback(
    async (path: string) => {
      setConfirmDelete(null);
      try {
        const r = await request<{ removedCount: number }>("pi:delete", { path });
        const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
        void loadDir(dir);
        void loadGitStatus();
        toast.success(`已删除 ${path}（${r.removedCount} 项）`);
      } catch (e) {
        toast.error(`删除失败：${e instanceof Error ? e.message : String(e)}`);
      }
    },
    [request, tree, loadDir, loadGitStatus],
  );

  const doCreate = useCallback(async () => {
    if (!newTarget) return;
    const name = newName.trim();
    setNewTarget(null);
    setNewName("");
    if (name === "") return;
    try {
      if (newTarget.type === "dir") {
        await request("pi:mkdir", { path: newTarget.dir === "" ? name : `${newTarget.dir}/${name}` });
      } else {
        const path = newTarget.dir === "" ? name : `${newTarget.dir}/${name}`;
        await request("pi:touch", { path });
        onOpenFile(path, name, false);
      }
      void loadDir(newTarget.dir);
      void loadGitStatus();
    } catch (e) {
      toast.error(`新建失败：${e instanceof Error ? e.message : String(e)}`);
    }
  }, [newTarget, newName, request, tree, loadDir, loadGitStatus, onOpenFile]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b px-3">
        <FolderTree className="text-muted-foreground size-4" />
        <span className="truncate text-sm font-semibold">文件浏览</span>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="icon" className="size-7" onClick={refresh} title="刷新目录树">
            <RefreshCw className={loading ? "animate-spin" : ""} />
          </Button>
        </div>
      </div>
      <div className="flex items-center gap-2 px-3 py-1">
        <span className="bg-muted text-muted-foreground truncate rounded px-1.5 py-0.5 font-mono text-[11px]">
          {gitStatusLabel(gitInfo)}
        </span>
      </div>
      {error && <div className="bg-destructive/10 text-destructive px-3 py-1 text-xs">{error}</div>}
      <div className="flex min-h-0 flex-1 flex-col">
        <TreeView
          nodes={tree.nodes}
          selectedPath={activePath}
          gitStatus={gitStatus}
          renamingPath={renaming}
          onToggleDir={toggleDir}
          onOpenFile={(path, preview) => onOpenFile(path, path.split("/").pop() ?? path, preview)}
          onRenameStart={(path) => setRenaming(path)}
          onRenameCommit={(path, name) => void commitRename(path, name)}
          onRenameCancel={() => setRenaming(null)}
          onDelete={(path) => {
            setConfirmDelete(path);
            setDeleteCount(null);
            request<{ count: number }>("pi:countTree", { path })
              .then((r) => setDeleteCount(r.count))
              .catch(() => setDeleteCount(null));
          }}
          onNewFile={(dir) => {
            setNewName("");
            setNewTarget({ dir, type: "file" });
          }}
          onNewDir={(dir) => {
            setNewName("");
            setNewTarget({ dir, type: "dir" });
          }}
          onOpenDiff={(path) => onOpenDiff?.(path)}
          onCopyPath={(path) => {
            navigator.clipboard.writeText(path).then(
              () => toast.success(`已复制 ${path}`),
              () => toast.error("复制失败"),
            );
          }}
        />
      </div>

      <Dialog open={newTarget !== null} onOpenChange={(open) => !open && setNewTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建{newTarget?.type === "dir" ? "文件夹" : "文件"}</DialogTitle>
            <DialogDescription>位置：{newTarget?.dir === "" ? "（根）" : newTarget?.dir}</DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={newName}
            placeholder="名称"
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void doCreate();
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewTarget(null)}>
              取消
            </Button>
            <Button disabled={newName.trim() === ""} onClick={() => void doCreate()}>
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDelete !== null} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除 {confirmDelete ?? ""}？</DialogTitle>
            <DialogDescription>
              此操作将递归删除该文件/目录及其所有内容，且无法撤销。
              {deleteCount !== null && `（共 ${deleteCount} 项）`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>
              取消
            </Button>
            <Button variant="destructive" onClick={() => confirmDelete && void doDelete(confirmDelete)}>
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
