import { useState } from "react";
import { Copy, GitBranch, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/shared/ui";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/shared/ui";
import { Input } from "@/shared/ui";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui";
import type { SessionInfo } from "@/entities/chat";

export interface SessionActions {
  onSelect: (path: string, name: string) => void;
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
  openSessionFiles,
  degraded,
  actions,
}: {
  sessions: SessionInfo[];
  currentSessionFile: string | null;
  /** 已实例化的会话（有注册进程）——标记 ●；点击激活/重开而非重复实例化 */
  openSessionFiles: Set<string>;
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
        <div className="border-warning/40 bg-warning/10 text-foreground mt-2 rounded-md border px-2 py-1.5 text-[11px] leading-snug">
          已切换到新会话：对话正常；切换/新建/树导航需在 TUI 输入 /web 恢复
        </div>
      )}

      <div className="scrollbar-thin scrollbar-gutter-stable mt-2 h-40 overflow-y-auto">
        <ul className="flex flex-col gap-1">
          {sessions.map((s) => {
            const active = currentSessionFile === s.path;
            const opened = openSessionFiles.has(s.path);
            const label = s.name || s.firstMessage || s.path.split("/").pop() || s.path;
            return (
              <li
                key={s.path}
                className={`group flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs ${active ? "bg-accent" : ""}`}
              >
                <button
                  type="button"
                  aria-label={label}
                  title={label}
                  className="focus-visible:ring-ring hover:bg-muted/60 flex min-w-0 flex-1 items-center gap-1.5 rounded-sm text-left focus-visible:ring-2"
                  onClick={() => actions.onSelect(s.path, label)}
                >
                  <span className={`min-w-0 flex-1 truncate ${active ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                    {opened ? "● " : ""}
                    {label}
                  </span>
                  <span className="text-muted-foreground shrink-0 tabular-nums">{s.messageCount}条</span>
                </button>
                <span
                  className="flex max-w-0 shrink-0 items-center gap-0.5 overflow-hidden opacity-0 transition-[max-width,opacity] duration-150 group-hover:max-w-[4rem] group-hover:opacity-100"
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
