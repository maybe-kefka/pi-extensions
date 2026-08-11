import { useMemo, useState } from "react";
import { GitBranch, Loader2 } from "lucide-react";
import { Badge } from "@/shared/ui";
import { Button } from "@/shared/ui";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/shared/ui";
import type { TreeNode } from "@/entities/chat";

/** 从 entry 提取展示文本（消息取文本内容截断；其他类型取类型名） */
export function entrySummary(node: TreeNode): { text: string; kind: string } {
  const e = node.entry;
  const kind = e.type === "message" ? String(e.message?.role ?? "message") : String(e.type);
  let text = node.label ?? "";
  if (!text && e.type === "message" && typeof e.message === "object" && e.message !== null) {
    const content = (e.message as { content?: unknown }).content;
    if (typeof content === "string") text = content;
    else if (Array.isArray(content)) {
      text = content
        .map((b) => (b && typeof b === "object" && "text" in (b as object) ? String((b as { text: unknown }).text) : ""))
        .filter(Boolean)
        .join(" ");
    }
  }
  if (!text) text = node.entry.id;
  const single = text.replace(/\s+/g, " ").trim();
  return { text: single.length > 60 ? `${single.slice(0, 60)}…` : single, kind };
}

const KIND_LABEL: Record<string, { label: string; variant: "secondary" | "outline" | "default" }> = {
  user: { label: "用户", variant: "secondary" },
  assistant: { label: "助手", variant: "default" },
  toolResult: { label: "工具", variant: "outline" },
  thinking_level_change: { label: "思考", variant: "outline" },
  model_change: { label: "模型", variant: "outline" },
  compaction: { label: "压缩", variant: "outline" },
  branch_summary: { label: "分支", variant: "outline" },
  session_info: { label: "信息", variant: "outline" },
  label_change: { label: "标签", variant: "outline" },
  custom: { label: "自定义", variant: "outline" },
};

function TreeNodeView({
  node,
  depth,
  currentLeafId,
  onNavigate,
  navigable,
}: {
  node: TreeNode;
  depth: number;
  currentLeafId: string | null;
  onNavigate: (targetId: string) => void;
  navigable: boolean;
}) {
  const { text, kind } = entrySummary(node);
  const meta = KIND_LABEL[kind] ?? { label: kind, variant: "outline" as const };
  const isLeaf = node.entry.id === currentLeafId;
  const [confirming, setConfirming] = useState(false);
  const hasChildren = node.children && node.children.length > 0;
  const truncated = node.truncated === true;

  return (
    <li>
      <div
        className={`group flex items-center gap-1.5 rounded-md px-2 py-1 text-xs ${
          isLeaf ? "bg-accent" : "hover:bg-muted/50"
        }`}
        style={{ marginLeft: depth * 14 }}
      >
        <GitBranch className="text-muted-foreground size-3 shrink-0" />
        <Badge variant={meta.variant} className="shrink-0">{meta.label}</Badge>
        <span className={`min-w-0 flex-1 truncate ${isLeaf ? "text-foreground font-medium" : "text-muted-foreground"}`}>
          {text}
        </span>
        {isLeaf && <Badge variant="secondary" className="shrink-0">当前</Badge>}
        {truncated && <Badge variant="outline" className="text-muted-foreground shrink-0">深度已截断</Badge>}
        {navigable && !isLeaf && (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground h-5 cursor-pointer px-1.5 text-[10px] opacity-0 group-hover:opacity-100"
            onClick={() => setConfirming(true)}
          >
            导航
          </Button>
        )}
      </div>
      {hasChildren && (
        <ul>
          {node.children.map((c) => (
            <TreeNodeView
              key={c.entry.id}
              node={c}
              depth={depth + 1}
              currentLeafId={currentLeafId}
              onNavigate={onNavigate}
              navigable={navigable}
            />
          ))}
        </ul>
      )}
      <Dialog open={confirming} onOpenChange={(o) => !o && setConfirming(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>导航到该节点？</DialogTitle>
            <DialogDescription className="truncate">{text}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)}>取消</Button>
            <Button
              onClick={() => {
                setConfirming(false);
                onNavigate(node.entry.id);
              }}
            >
              导航
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  );
}

export function TreeDialog({
  open,
  onOpenChange,
  tree,
  loading,
  currentLeafId,
  navigable,
  onNavigate,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  tree: TreeNode[] | null;
  loading: boolean;
  currentLeafId: string | null;
  navigable: boolean;
  onNavigate: (targetId: string) => void;
}) {
  const count = useMemo(() => {
    let n = 0;
    const walk = (nodes: TreeNode[]) => {
      for (const nd of nodes) {
        n += 1;
        if (nd.children) walk(nd.children);
      }
    };
    if (tree) walk(tree);
    return n;
  }, [tree]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">🌳 会话树（{count} 节点）</DialogTitle>
          <DialogDescription>
            {navigable ? "点击节点上的「导航」切换到该分支位置" : "会话树只读查看"}
          </DialogDescription>
        </DialogHeader>
        <div className="scrollbar-thin scrollbar-gutter-stable h-[50vh] overflow-y-auto">
          {loading ? (
            <div className="text-muted-foreground flex items-center gap-1.5 p-2 text-xs">
              <Loader2 className="size-3 animate-spin" /> 加载中…
            </div>
          ) : tree && tree.length > 0 ? (
            <ul className="flex flex-col gap-0.5">
              {tree.map((n) => (
                <TreeNodeView
                  key={n.entry.id}
                  node={n}
                  depth={0}
                  currentLeafId={currentLeafId}
                  onNavigate={onNavigate}
                  navigable={navigable}
                />
              ))}
            </ul>
          ) : (
            <div className="text-muted-foreground p-2 text-xs">（无树数据）</div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
