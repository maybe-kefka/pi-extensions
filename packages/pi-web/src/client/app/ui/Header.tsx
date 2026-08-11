
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import { Progress } from "@/shared/ui/progress";
import { ContextPanel } from "@/features/context/ContextPanel";
import type { RpcClient } from "@/shared/api/rpc";
import type { StreamState } from "@/entities/chat/stream";

function fmt(n: number | null): string {
  return n == null ? "—" : n.toLocaleString("en-US");
}

export function Header({
  conn,
  state,
  onCompact,
  getRequest,
}: {
  conn: StreamState["conn"];
  state: StreamState;
  onCompact: () => void;
  getRequest: () => RpcClient["request"];
}) {
  return (
    <header className="flex items-center gap-3 border-b px-4 pt-[calc(env(safe-area-inset-top)+8px)] pb-2">
      <div className="text-sm font-bold">
        pi <span className="text-muted-foreground hidden font-normal sm:inline">web console</span>
      </div>
      <Badge variant={conn === "open" ? "default" : conn === "connecting" ? "secondary" : "destructive"}>
        {conn === "open" ? "已连接" : conn === "connecting" ? "连接中…" : "未连接"}
      </Badge>
      <div className="ml-auto" />
    </header>
  );
}
