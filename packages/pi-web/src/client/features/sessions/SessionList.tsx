import { useState } from "react";
import { Copy, GitBranch, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";
import type { SessionInfo } from "@/entities/chat/types";

export interface SessionActions {
  onSelect: (path: string) => void;
  onNew: () => void;
  onDelete: (path: string) => void;
  onRename: (path: string, name: string) => void;
  onClone: () => void;
  onShowTree: () => void;
  onRefresh: () => void;
}

/** 会话列表：点击切换 + 每项工具栏（删除/重命名/查看树/复制）+ 顶部新建 + 降级提示条 */
export function SessionList({
  sessions,
  currentSessionFile,
  degraded,
  actions,
}: {
  sessions: SessionInfo[];
  currentSessionFile: string | null;
  degraded: boolean;
  actions: SessionActions;
}) {
  const [renaming, setRenaming] = useState<SessionInfo | null>(null);
  const [name, setName] = useState("");
  const [deleting, setDeleting] = useState<SessionInfo | null>(null);

  return (
    <>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" className="h-7 flex-1 cursor-pointer" onClick={actions.onNew}>
          <Plus data-icon="inline-start" className="size-3.5" /> 新建
        </Button>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="sm" variant="outline" className="h-7 cursor-pointer" onClick={actions.onClone} title="复制当前会话">
              <Copy className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>复制当前会话（clone）</TooltipContent>
        </Tooltip>
      </div>

      {degraded && (
        <div className="border-warning/40 bg-warning/10 text-warning mt-2 rounded-md border px-2 py-1.5 text-[11px] leading-snug">
          会话控制能力已失效（TUI 已切换会话）：新建/切换/fork/树导航需在 TUI 重跑 /web 恢复
        </div>
      )}

      <div className="scrollbar-thin scrollbar-gutter-stable mt-2 h-40 overflow-y-auto">
        <ul className="flex flex-col gap-1">
          {sessions.map((s) => {
            const active = currentSessionFile === s.path;
            const label = s.name || s.firstMessage || s.path.split("/").pop() || s.path;
            return (
              <li
                key={s.path}
                className={`group flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-xs transition-colors ${
                  active ? "bg-accent" : "hover:bg-muted/60"
                }`}
                onClick={() => actions.onSelect(s.path)}
              >
                <span className={`min-w-0 flex-1 truncate ${active ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                  {label}
                </span>
                <span className="text-muted-foreground shrink-0 tabular-nums">{s.messageCount}条</span>
                {active && <Badge variant="secondary" className="shrink-0">当前</Badge>}
                <span
                  className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground size-5 cursor-pointer"
                    title="重命名"
                    onClick={() => {
                      setRenaming(s);
                      setName(s.name ?? "");
                    }}
                  >
                    <Pencil className="size-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground size-5 cursor-pointer"
                    title="查看树"
                    onClick={actions.onShowTree}
                  >
                    <GitBranch className="size-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground size-5 cursor-pointer"
                    title={active ? "当前会话不可删除" : "删除"}
                    disabled={active}
                    onClick={() => setDeleting(s)}
                  >
                    <Trash2 className="size-3" />
                  </Button>
                </span>
              </li>
            );
          })}
          {sessions.length === 0 && <li className="text-muted-foreground text-xs">暂无会话</li>}
        </ul>
      </div>

      {/* 重命名弹窗 */}
      <Dialog open={renaming !== null} onOpenChange={(o) => !o && setRenaming(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>重命名会话</DialogTitle>
            <DialogDescription className="truncate">{renaming?.path}</DialogDescription>
          </DialogHeader>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="新名称（留空清除）"
            onKeyDown={(e) => {
              if (e.key === "Enter" && renaming) {
                actions.onRename(renaming.path, name.trim());
                setRenaming(null);
              }
            }}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenaming(null)}>取消</Button>
            <Button
              onClick={() => {
                if (renaming) actions.onRename(renaming.path, name.trim());
                setRenaming(null);
              }}
            >
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认弹窗 */}
      <Dialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>删除会话？</DialogTitle>
            <DialogDescription>
              {deleting && (
                <span className="block truncate">
                  {deleting.name || deleting.firstMessage || deleting.path}
                </span>
              )}
              <span className="text-muted-foreground mt-1 block text-xs">
                {deleting?.messageCount} 条消息。将直接从磁盘删除会话文件，不可恢复。
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>取消</Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleting) actions.onDelete(deleting.path);
                setDeleting(null);
              }}
            >
              <Trash2 data-icon="inline-start" className="size-3.5" /> 删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function SessionListLoading() {
  return (
    <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
      <Loader2 className="size-3 animate-spin" /> 加载中…
    </div>
  );
}
