import { PanelLeftClose, PanelLeftOpen, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { StreamState } from "@/lib/stream";

function fmt(n: number | null): string {
  return n == null ? "—" : n.toLocaleString("en-US");
}

export function Header({
  conn,
  state,
  sidebarCollapsed,
  onToggleSidebar,
  onOpenDrawer,
}: {
  conn: StreamState["conn"];
  state: StreamState;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  onOpenDrawer: () => void;
}) {
  const ctx = state.context;
  const percent = ctx.percent ?? 0;
  const label = ctx.percent == null ? "—" : `${(ctx.percent * 100).toFixed(1)}%`;
  const title = `${label}（${fmt(ctx.tokens)} / ${fmt(ctx.contextWindow)}）`;

  return (
    <header className="flex items-center gap-3 border-b px-4 pt-[env(safe-area-inset-top)] py-2">
      <div className="text-sm font-bold">
        pi <span className="text-muted-foreground hidden font-normal sm:inline">web console</span>
      </div>
      <Badge variant={conn === "open" ? "default" : conn === "connecting" ? "secondary" : "destructive"}>
        {conn === "open" ? "已连接" : conn === "connecting" ? "连接中…" : "未连接"}
      </Badge>
      <div className="ml-auto flex items-center gap-2">
        <span className="flex items-center gap-2 text-xs" title={title}>
          <Progress value={ctx.percent == null ? 0 : percent * 100} className="h-1.5 w-16 sm:w-24" />
          <span className="tabular-nums">{label}</span>
        </span>
        {/* 窄屏：打开抽屉 */}
        <Button
          variant="ghost"
          size="icon"
          className="size-8 lg:hidden"
          onClick={onOpenDrawer}
          title="面板"
        >
          <SlidersHorizontal className="size-4" />
        </Button>
        {/* 宽屏：折叠/展开侧栏 */}
        <Button
          variant="ghost"
          size="icon"
          className="hidden size-8 lg:inline-flex"
          onClick={onToggleSidebar}
          title={sidebarCollapsed ? "展开侧栏" : "折叠侧栏"}
        >
          {sidebarCollapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
        </Button>
      </div>
    </header>
  );
}
