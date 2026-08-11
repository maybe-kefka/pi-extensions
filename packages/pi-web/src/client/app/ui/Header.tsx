import { Badge } from "@/shared/ui/badge";
import type { StreamState } from "@/entities/chat/stream";

export function Header({ conn }: { conn: StreamState["conn"] }) {
  return (
    <header className="flex items-center gap-3 border-b px-4 pt-[calc(env(safe-area-inset-top)+8px)] pb-2">
      <div className="text-sm font-bold">
        pi <span className="text-muted-foreground hidden font-normal sm:inline">web console</span>
      </div>
      <Badge variant={conn === "open" ? "default" : conn === "connecting" ? "secondary" : "destructive"}>
        {conn === "open" ? "已连接" : conn === "connecting" ? "连接中…" : "未连接"}
      </Badge>
    </header>
  );
}
