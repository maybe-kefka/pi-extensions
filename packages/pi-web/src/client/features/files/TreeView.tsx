import { ChevronDown, ChevronRight, File, Folder, FolderOpen } from "lucide-react";
import type { FileTreeNode } from "@/entities/files/tree";

export interface TreeViewProps {
  nodes: FileTreeNode[];
  selectedPath: string | null;
  onToggleDir: (path: string) => void;
  onOpenFile: (path: string) => void;
}

function Row({
  node,
  depth,
  selected,
  onToggleDir,
  onOpenFile,
}: {
  node: FileTreeNode;
  depth: number;
  selected: boolean;
  onToggleDir: (path: string) => void;
  onOpenFile: (path: string) => void;
}) {
  const isDir = node.type === "dir";
  const expanded = node.children !== null;
  const label = node.name === "" ? "（cwd）" : node.name;
  return (
    <div>
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
        <span className="truncate">{label}</span>
        {node.loading && <span className="text-muted-foreground">…</span>}
        {node.error && <span className="text-destructive">加载失败</span>}
      </button>
      {isDir && expanded && node.children && (
        <div>
          {node.children.map((child) => (
            <Row
              key={child.path}
              node={child}
              depth={depth + 1}
              selected={selected}
              onToggleDir={onToggleDir}
              onOpenFile={onOpenFile}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function TreeView({ nodes, selectedPath, onToggleDir, onOpenFile }: TreeViewProps) {
  return (
    <div className="scrollbar-thin scrollbar-gutter-stable min-h-0 flex-1 overflow-y-auto py-1">
      {nodes.map((n) => (
        <Row
          key={n.path}
          node={n}
          depth={0}
          selected={selectedPath === n.path && n.type === "file"}
          onToggleDir={onToggleDir}
          onOpenFile={onOpenFile}
        />
      ))}
    </div>
  );
}
