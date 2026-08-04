import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { StreamState } from "@/lib/stream";

function fmt(n: number | null): string {
  return n == null ? "—" : n.toLocaleString("en-US");
}

export function Header({ conn, state }: { conn: StreamState["conn"]; state: StreamState }) {
  const ctx = state.context;
  const percent = ctx.percent ?? 0;
  const label = ctx.percent == null ? "占用 —" : `${(ctx.percent * 100).toFixed(1)}%`;
  const title = `${label}（${fmt(ctx.tokens)} / ${fmt(ctx.contextWindow)}）`;

  return (
    <header className="flex items-center gap-3 border-b px-4 py-2">
      <div className="text-sm font-bold">
        pi <span className="text-muted-foreground font-normal">web console</span>
      </div>
      <Badge variant={conn === "open" ? "default" : conn === "connecting" ? "secondary" : "destructive"}>
        {conn === "open" ? "已连接" : conn === "connecting" ? "连接中…" : "未连接"}
      </Badge>
      <div className="text-muted-foreground ml-auto flex items-center gap-4 text-xs">
        <span className="max-w-56 truncate" title={state.sessionFile ?? undefined}>
          会话 {state.sessionName || (state.sessionFile ? state.sessionFile.split("/").pop() : "—")}
        </span>
        <span className="max-w-48 truncate" title={state.model ? `${state.model.provider}/${state.model.id}` : undefined}>
          模型 {state.model ? `${state.model.provider}/${state.model.id}` : "—"}
        </span>
        <span>思考 {state.thinkingLevel ?? "—"}</span>
        <span className="flex items-center gap-2" title={title}>
          <Progress value={ctx.percent == null ? 0 : percent * 100} className="h-1.5 w-24" />
          <span className="tabular-nums">{label}</span>
        </span>
      </div>
    </header>
  );
}
