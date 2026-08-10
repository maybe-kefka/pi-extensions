import { useRef } from "react";
import { ChevronDown, ChevronRight, File, FilePlus2, Folder, FolderOpen, FolderPlus, Pencil, Trash2 } from "lucide-react";
import type { FileTreeNode } from "@/entities/files/tree";
import { statusColorVar, statusMarker } from "@/entities/files/git-status";

export interface TreeViewProps {
  nodes: FileTreeNode[];
  selectedPath: string | null;
  /** path → git 状态（含目录聚合） */
  gitStatus?: Map<string, string>;
  /** 当前内联重命名的路径 */
  renamingPath: string | null;
  onToggleDir: (path: string) => void;
  onOpenFile: (path: string) => void;
  onRenameStart: (path: string) => void;
  onRenameCommit: (path: string, newName: string) => void;
  onRenameCancel: () => void;
  onDelete: (path: string) => void;
  onNewFile: (dir: string) => void;
  onNewDir: (dir: string) => void;
}

function Row({
  node,
  depth,
  selected,
  renaming,
  gitStatus,
  onToggleDir,
  onOpenFile,
  onRenameStart,
  onRenameCommit,
  onRenameCancel,
  onDelete,
  onNewFile,
  onNewDir,
}: {
  node: FileTreeNode;
  depth: number;
  selected: boolean;
  renaming: boolean;
  gitStatus?: Map<string, string>;
  onToggleDir: (path: string) => void;
  onOpenFile: (path: string) => void;
  onRenameStart: (path: string) => void;
  onRenameCommit: (path: string, newName: string) => void;
  onRenameCancel: () => void;
  onDelete: (path: string) => void;
  onNewFile: (dir: string) => void;
  onNewDir: (dir: string) => void;
}) {
  const isDir = node.type === "dir";
  const expanded = node.children !== null;
  const label = node.name === "" ? "（cwd）" : node.name;
  const marker = node.path === "" ? undefined : gitStatus?.get(node.path);
  const dir = node.path === "" ? "" : node.path;

  const ops = (
    <span className="bg-background invisible absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-0.5 group-hover:visible">
      {isDir && (
        <>
          <button title="新建文件" className="hover:text-foreground cursor-pointer p-0.5" onClick={(e) => { e.stopPropagation(); onNewFile(dir); }}>
            <FilePlus2 className="size-3.5" />
          </button>
          <button title="新建文件夹" className="hover:text-foreground cursor-pointer p-0.5" onClick={(e) => { e.stopPropagation(); onNewDir(dir); }}>
            <FolderPlus className="size-3.5" />
          </button>
        </>
      )}
      <button title="重命名" className="hover:text-foreground cursor-pointer p-0.5" onClick={(e) => { e.stopPropagation(); onRenameStart(node.path); }}>
        <Pencil className="size-3.5" />
      </button>
      <button title="删除" className="hover:text-destructive cursor-pointer p-0.5" onClick={(e) => { e.stopPropagation(); onDelete(node.path); }}>
        <Trash2 className="size-3.5" />
      </button>
    </span>
  );

  return (
    <div>
      <div className="group relative">
        <button
          className={`flex w-full cursor-pointer items-center gap-1.5 rounded px-2 py-1 text-left text-xs ${
            selected ? "bg-primary/15 text-primary" : "hover:bg-muted/60"
          }`}
          style={{ paddingLeft: `${8 + depth * 14}px` }}
          onClick={() => (isDir ? onToggleDir(node.path) : onOpenFile(node.path))}
          title={node.path === "" ? "工作目录（cwd）" : node.path}
        >
          {isDir ? (
            <>
              {expanded ? (
                <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
              )}
              {expanded ? (
                <FolderOpen className="size-3.5 shrink-0 text-muted-foreground" />
              ) : (
                <Folder className="size-3.5 shrink-0 text-muted-foreground" />
              )}
            </>
          ) : (
            <>
              <span className="w-3.5 shrink-0" />
              <File className="size-3.5 shrink-0 text-muted-foreground" />
            </>
          )}
          {renaming ? (
            <input
              autoFocus
              defaultValue={node.name}
              className="border-primary bg-background min-w-0 flex-1 rounded border px-1 text-xs"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === "Enter") onRenameCommit(node.path, (e.target as HTMLInputElement).value);
                if (e.key === "Escape") onRenameCancel();
              }}
              onBlur={onRenameCancel}
            />
          ) : (
            <span className="truncate">{label}</span>
          )}
          {marker && (
            <span className="shrink-0 font-mono text-[10px] font-bold" style={{ color: statusColorVar(marker) }} title={`git: ${marker}`}>
              {statusMarker(marker)}
            </span>
          )}
          {node.loading && <span className="text-muted-foreground">…</span>}
          {node.error && <span className="text-destructive">加载失败</span>}
        </button>
        {ops}
      </div>
      {isDir && expanded && node.children && (
        <div>
          {node.children.map((child) => (
            <Row
              key={child.path}
              node={child}
              depth={depth + 1}
              selected={selected}
              renaming={renaming}
              gitStatus={gitStatus}
              onToggleDir={onToggleDir}
              onOpenFile={onOpenFile}
              onRenameStart={onRenameStart}
              onRenameCommit={onRenameCommit}
              onRenameCancel={onRenameCancel}
              onDelete={onDelete}
              onNewFile={onNewFile}
              onNewDir={onNewDir}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** 文件树（git 标记 + hover 操作 + 键盘导航：↑↓ 移动 / Enter 打开 / F2 重命名 / Delete 删除） */
export function TreeView(props: TreeViewProps) {
  const { nodes, selectedPath, gitStatus, renamingPath, onToggleDir, onOpenFile, onRenameStart, onRenameCommit, onRenameCancel, onDelete, onNewFile, onNewDir } = props;
  const listRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={listRef}
      tabIndex={0}
      className="scrollbar-thin scrollbar-gutter-stable min-h-0 flex-1 overflow-y-auto py-1 outline-none"
      onKeyDown={(e) => {
        // 收集所有文件节点（扁平）
        const all: FileTreeNode[] = [];
        const walk = (list: FileTreeNode[]) => {
          for (const n of list) {
            all.push(n);
            if (n.children) walk(n.children);
          }
        };
        walk(nodes);
        const idx = all.findIndex((n) => n.path === selectedPath);
        if (e.key === "ArrowDown" && idx >= 0 && idx < all.length - 1) {
          e.preventDefault();
          const next = all[idx + 1];
          if (next.type === "file") onOpenFile(next.path);
          else onToggleDir(next.path);
        } else if (e.key === "ArrowUp" && idx > 0) {
          e.preventDefault();
          const prev = all[idx - 1];
          if (prev.type === "file") onOpenFile(prev.path);
          else onToggleDir(prev.path);
        } else if (e.key === "Delete" && selectedPath) {
          e.preventDefault();
          onDelete(selectedPath);
        } else if (e.key === "F2" && selectedPath) {
          e.preventDefault();
          onRenameStart(selectedPath);
        }
      }}
    >
      {nodes.map((n) => (
        <Row
          key={n.path}
          node={n}
          depth={0}
          selected={selectedPath === n.path && n.type === "file"}
          renaming={renamingPath === n.path}
          gitStatus={gitStatus}
          onToggleDir={onToggleDir}
          onOpenFile={onOpenFile}
          onRenameStart={onRenameStart}
          onRenameCommit={onRenameCommit}
          onRenameCancel={onRenameCancel}
          onDelete={onDelete}
          onNewFile={onNewFile}
          onNewDir={onNewDir}
        />
      ))}
    </div>
  );
}
