import { PanelLeftClose, PanelLeftOpen, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { ContextPanel } from "@/components/ContextPanel";
import type { RpcClient } from "@/lib/rpc";
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
  onCompact,
  getRequest,
}: {
  conn: StreamState["conn"];
  state: StreamState;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  onOpenDrawer: () => void;
  onCompact: () => void;
  getRequest: () => RpcClient["request"];
}) {
  const ctx = state.context;
  const percent = ctx.percent ?? 0;
  const label = ctx.percent == null ? "—" : `${(ctx.percent * 100).toFixed(1)}%`;
  const title = `${label}（${fmt(ctx.tokens)} / ${fmt(ctx.contextWindow)}）— 点击查看占用详情`;

  return (
    <header className="flex items-center gap-3 border-b px-4 pt-[env(safe-area-inset-top)] py-2">
      <div className="text-sm font-bold">
        pi <span className="text-muted-foreground hidden font-normal sm:inline">web console</span>
      </div>
      <Badge variant={conn === "open" ? "default" : conn === "connecting" ? "secondary" : "destructive"}>
        {conn === "open" ? "已连接" : conn === "connecting" ? "连接中…" : "未连接"}
      </Badge>
      <div className="ml-auto flex items-center gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <button
              className="hover:bg-muted/60 flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-xs"
              title={title}
            >
              <Progress value={ctx.percent == null ? 0 : percent * 100} className="h-1.5 w-16 sm:w-24" />
              <span className="tabular-nums">{label}</span>
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="mr-2 mt-1">
            <ContextPanel getRequest={getRequest} onCompact={onCompact} />
          </PopoverContent>
        </Popover>
        {/* 窄屏：打开抽屉 */}
        <Button variant="ghost" size="icon" className="size-8 lg:hidden" onClick={onOpenDrawer} title="面板">
          <SlidersHorizontal />
        </Button>
        {/* 宽屏：折叠/展开侧栏 */}
        <Button
          variant="ghost"
          size="icon"
          className="hidden size-8 lg:inline-flex"
          onClick={onToggleSidebar}
          title={sidebarCollapsed ? "展开侧栏" : "折叠侧栏"}
        >
          {sidebarCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
        </Button>
      </div>
    </header>
  );
}
