import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Eye, FolderTree, RefreshCw } from "lucide-react";
import { Button } from "@/shared/ui/button";
import type { RpcClient } from "@/shared/api/rpc";
import {
  applyListing,
  collapseDir,
  createRootTree,
  findNode,
  setDirState,
  type DirEntryDto,
  type TreeState,
} from "@/entities/files/tree";
import { gitStatusLabel, type GitInfoDto } from "@/entities/files/git-info";
import { TreeView } from "./TreeView";

export interface FilesTreeProps {
  request: RpcClient["request"];
  /** 打开文件（App 层进入 tab 系统） */
  onOpenFile: (path: string, name: string) => void;
  /** 当前激活文件（树高亮） */
  activePath: string | null;
}

/** 文件浏览树面板（activity bar 文件面板 / 文件视图左侧；tabs 迭代后编辑器归主区） */
export function FilesTree({ request, onOpenFile, activePath }: FilesTreeProps) {
  const [tree, setTree] = useState<TreeState>(() => createRootTree({ showExcluded: false, showHidden: false }));
  const [gitInfo, setGitInfo] = useState<GitInfoDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inflight = useRef(new Set<string>());

  const loadDir = useCallback(
    async (path: string, state: TreeState): Promise<void> => {
      if (inflight.current.has(path)) return;
      inflight.current.add(path);
      setTree((prev) => setDirState(prev, path, { loading: true }));
      try {
        const { entries } = await request<{ entries: DirEntryDto[] }>("pi:listDir", {
          path,
          showExcluded: state.showExcluded,
          showHidden: state.showHidden,
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

  // 首屏加载根目录 + git 状态
  useEffect(() => {
    void loadDir("", tree);
    request<GitInfoDto>("pi:gitInfo")
      .then(setGitInfo)
      .catch(() => setGitInfo({ isRepo: false }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleDir = useCallback(
    (path: string) => {
      const node = findNode(tree.nodes, path);
      if (!node) return;
      if (node.children !== null) {
        setTree((prev) => collapseDir(prev, path));
      } else {
        void loadDir(path, tree);
      }
    },
    [tree, loadDir],
  );

  const refresh = useCallback(() => {
    setError(null);
    const fresh = createRootTree({ showExcluded: tree.showExcluded, showHidden: tree.showHidden });
    setTree(fresh);
    void loadDir("", fresh);
  }, [tree.showExcluded, tree.showHidden, loadDir]);

  const toggleShow = useCallback(
    (patch: { showExcluded?: boolean; showHidden?: boolean }) => {
      setError(null);
      // 开关变化后按新规则重建树并重载根目录（已展开子目录下次展开再拉取）
      const next = createRootTree({
        showExcluded: patch.showExcluded ?? tree.showExcluded,
        showHidden: patch.showHidden ?? tree.showHidden,
      });
      setTree(next);
      void loadDir("", next);
    },
    [tree.showExcluded, tree.showHidden, loadDir],
  );

  const statusLine = useMemo(() => {
    const parts: string[] = [];
    if (tree.showExcluded) parts.push("显示排除目录");
    if (tree.showHidden) parts.push("显示隐藏文件");
    return parts.join(" · ") || "默认过滤：node_modules/.git/dist/.pi 与隐藏文件";
  }, [tree.showExcluded, tree.showHidden]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-1.5">
        <FolderTree className="text-muted-foreground size-4" />
        <span className="truncate text-sm font-semibold">文件浏览</span>
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant={tree.showExcluded ? "secondary" : "ghost"}
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => toggleShow({ showExcluded: !tree.showExcluded })}
            title="显示 node_modules/.git/dist/.pi"
          >
            排除项
          </Button>
          <Button
            variant={tree.showHidden ? "secondary" : "ghost"}
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => toggleShow({ showHidden: !tree.showHidden })}
            title="显示 .env 等隐藏文件"
          >
            <Eye className="mr-1 size-3" />
            隐藏
          </Button>
          <Button variant="ghost" size="icon" className="size-7" onClick={refresh} title="刷新目录树">
            <RefreshCw className={loading ? "animate-spin" : ""} />
          </Button>
        </div>
      </div>
      <div className="flex items-center gap-2 px-3 py-1">
        <span className="bg-muted text-muted-foreground truncate rounded px-1.5 py-0.5 font-mono text-[11px]">
          {gitStatusLabel(gitInfo)}
        </span>
        <span className="text-muted-foreground truncate text-[11px]">{statusLine}</span>
      </div>
      {error && <div className="bg-destructive/10 text-destructive px-3 py-1 text-xs">{error}</div>}
      <div className="min-h-0 flex-1">
        <TreeView
          nodes={tree.nodes}
          selectedPath={activePath}
          onToggleDir={toggleDir}
          onOpenFile={(path) => onOpenFile(path, path.split("/").pop() ?? path)}
        />
      </div>
    </div>
  );
}
