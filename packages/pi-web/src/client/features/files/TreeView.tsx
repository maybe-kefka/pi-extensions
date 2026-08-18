import { useRef, type ReactNode } from "react";
import { ChevronDown, ChevronRight, Copy, File, FilePlus2, Folder, FolderOpen, FolderPlus, GitCompareArrows, Pencil, Trash2 } from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/shared/ui";
import type { FileTreeNode } from "@/entities/files";
import { statusColorVar, statusMarker } from "@/entities/files";

export interface TreeViewProps {
  nodes: FileTreeNode[];
  selectedPath: string | null;
  /** path → git 状态（含目录聚合） */
  gitStatus?: Map<string, string>;
  /** 当前内联重命名的路径 */
  renamingPath: string | null;
  onToggleDir: (path: string) => void;
  /** 打开文件（preview: 单击预览 / false: 双击与 Enter 正式打开） */
  onOpenFile: (path: string, preview: boolean) => void;
  onRenameStart: (path: string) => void;
  onRenameCommit: (path: string, newName: string) => void;
  onRenameCancel: () => void;
  onDelete: (path: string) => void;
  onNewFile: (dir: string) => void;
  onNewDir: (dir: string) => void;
  /** 右键菜单：打开 diff（仅文件） */
  onOpenDiff: (path: string) => void;
  /** 右键菜单：复制路径 */
  onCopyPath: (path: string) => void;
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
  onOpenDiff,
  onCopyPath,
}: {
  node: FileTreeNode;
  depth: number;
  selected: boolean;
  renaming: boolean;
  gitStatus?: Map<string, string>;
  onToggleDir: (path: string) => void;
  onOpenFile: (path: string, preview: boolean) => void;
  onRenameStart: (path: string) => void;
  onRenameCommit: (path: string, newName: string) => void;
  onRenameCancel: () => void;
  onDelete: (path: string) => void;
  onNewFile: (dir: string) => void;
  onNewDir: (dir: string) => void;
  onOpenDiff: (path: string) => void;
  onCopyPath: (path: string) => void;
}) {
  const isDir = node.type === "dir";
  const expanded = node.children !== null;
  const label = node.name === "" ? "（cwd）" : node.name;
  const marker = node.path === "" ? undefined : gitStatus?.get(node.path);
  const dir = node.path === "" ? "" : node.path;

  const menuItems = buildFileMenuItems({
    isDir,
    dir,
    path: node.path,
    onOpenFile,
    onOpenDiff,
    onRenameStart,
    onDelete,
    onNewFile,
    onNewDir,
    onCopyPath,
  });

  return (
    <div>
      <ContextMenu>
        <ContextMenuTrigger asChild>
      <div className="group relative">
        <button
          className={`flex w-full cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-left text-xs ${
            selected ? "bg-active text-foreground" : "hover:bg-hover"
          }`}
          style={{ paddingLeft: `${8 + depth * 14}px` }}
          onClick={() => (isDir ? onToggleDir(node.path) : onOpenFile(node.path, true))}
          onDoubleClick={() => (isDir ? undefined : onOpenFile(node.path, false))}
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
            <span className="shrink-0 font-mono text-[11px] font-bold" style={{ color: statusColorVar(marker) }} title={`git: ${marker}`}>
              {statusMarker(marker)}
            </span>
          )}
          {node.loading && <span className="text-muted-foreground">…</span>}
          {node.error && <span className="text-destructive">加载失败</span>}
        </button>
      </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-40">
          {menuItems.map((m, i) => (
            <ContextMenuItem key={m.label} onSelect={m.onSelect} className={m.danger ? "text-destructive" : ""}>
              <span className="flex items-center gap-1.5">
                {m.icon}
                {m.label}
              </span>
            </ContextMenuItem>
          ))}
        </ContextMenuContent>
      </ContextMenu>
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
              onOpenDiff={onOpenDiff}
              onCopyPath={onCopyPath}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export interface FileMenuHandlers {
  onOpenFile: (path: string, preview: boolean) => void;
  onOpenDiff: (path: string) => void;
  onRenameStart: (path: string) => void;
  onDelete: (path: string) => void;
  onNewFile: (dir: string) => void;
  onNewDir: (dir: string) => void;
  onCopyPath: (path: string) => void;
}

/** 右键菜单项构建（纯函数——回调映射可单测；jsdom 无法触发 radix select） */
export function buildFileMenuItems(input: {
  isDir: boolean;
  dir: string;
  path: string;
} & FileMenuHandlers): { label: string; icon: ReactNode; onSelect: () => void; danger?: boolean }[] {
  const items: { label: string; icon: ReactNode; onSelect: () => void; danger?: boolean }[] = [];
  if (input.isDir) {
    items.push(
      { label: "新建文件", icon: <FilePlus2 className="size-3.5" />, onSelect: () => input.onNewFile(input.dir) },
      { label: "新建文件夹", icon: <FolderPlus className="size-3.5" />, onSelect: () => input.onNewDir(input.dir) },
    );
  } else {
    items.push(
      { label: "打开", icon: <File className="size-3.5" />, onSelect: () => input.onOpenFile(input.path, false) },
      { label: "打开 diff", icon: <GitCompareArrows className="size-3.5" />, onSelect: () => input.onOpenDiff(input.path) },
    );
  }
  items.push(
    { label: "重命名", icon: <Pencil className="size-3.5" />, onSelect: () => input.onRenameStart(input.path) },
    { label: "删除", icon: <Trash2 className="size-3.5" />, onSelect: () => input.onDelete(input.path), danger: true },
    { label: "复制路径", icon: <Copy className="size-3.5" />, onSelect: () => input.onCopyPath(input.path) },
  );
  return items;
}

/** 文件树（git 标记 + 右键菜单 + 键盘导航：↑↓ 移动 / Enter 打开 / F2 重命名 / Delete 删除） */
export function TreeView(props: TreeViewProps) {
  const { nodes, selectedPath, gitStatus, renamingPath, onToggleDir, onOpenFile, onRenameStart, onRenameCommit, onRenameCancel, onDelete, onNewFile, onNewDir, onOpenDiff, onCopyPath } = props;
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
          if (next.type === "file") onOpenFile(next.path, false);
          else onToggleDir(next.path);
        } else if (e.key === "ArrowUp" && idx > 0) {
          e.preventDefault();
          const prev = all[idx - 1];
          if (prev.type === "file") onOpenFile(prev.path, false);
          else onToggleDir(prev.path);
        } else if (e.key === "Enter" && idx >= 0) {
          e.preventDefault();
          const cur = all[idx];
          if (cur.type === "file") onOpenFile(cur.path, false); // Enter = 正式打开（vscode 语义）
          else onToggleDir(cur.path);
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
          onOpenDiff={onOpenDiff}
          onCopyPath={onCopyPath}
        />
      ))}
    </div>
  );
}
