import { useEffect, useState } from "react";
import { Info, ListOrdered, RefreshCw } from "lucide-react";
import { Button } from "@/shared/ui";
import { Separator } from "@/shared/ui";
import { SessionList, type SessionActions } from "@/features/sessions";
import type { SessionInfo } from "@/entities/chat";
import type { StreamState } from "@/entities/chat";

export interface SessionPanelProps {
  sessions: SessionInfo[];
  currentSessionFile: string | null;
  openSessionFiles: Set<string>;
  bridge: StreamState["bridge"];
  sessionDegraded: boolean;
  sessionActions: SessionActions;
}

/** 会话管理面板（activity bar）：会话列表/操作 + 状态桥接 */
export function SessionPanel(props: SessionPanelProps) {
  const { sessions, currentSessionFile, openSessionFiles, bridge, sessionDegraded, sessionActions } = props;
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (refreshKey > 0) sessionActions.onRefresh();
  }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="scrollbar-thin scrollbar-gutter-stable flex h-full flex-col gap-4 overflow-y-auto p-3">
      <section className="flex flex-col gap-2 border-b pb-4" aria-labelledby="sessions-heading">
        <div className="flex items-center justify-between">
          <h2 id="sessions-heading" className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">会话</h2>
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            aria-label="刷新会话"
            title="刷新"
            onClick={() => setRefreshKey((k) => k + 1)}
          >
            <RefreshCw />
          </Button>
        </div>
        <div>
          <SessionList
            sessions={sessions}
            currentSessionFile={currentSessionFile}
            openSessionFiles={openSessionFiles}
            degraded={sessionDegraded}
            actions={sessionActions}
          />
        </div>
      </section>

      <section className="flex flex-col gap-2" aria-labelledby="bridge-heading">
        <h2 id="bridge-heading" className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">状态桥接</h2>
        <div className="flex flex-col gap-2 text-xs">
          {bridge.widget && (
            <pre className="border-border bg-muted/50 rounded border p-2 whitespace-pre-wrap font-mono text-[11px]">
              {bridge.widget.lines.join("\n")}
            </pre>
          )}
          {Object.entries(bridge.status).length > 0 && (
            <ul className="flex flex-col gap-1">
              {Object.entries(bridge.status).map(([k, v]) => (
                <li key={k} className="flex gap-1">
                  <span className="shrink-0 font-medium">{k}:</span>
                  <span className="text-muted-foreground truncate">{v}</span>
                </li>
              ))}
            </ul>
          )}
          {bridge.notifies.length > 0 && (
            <>
              <Separator />
              <ul className="flex flex-col gap-1">
                {bridge.notifies.map((n) => (
                  <li key={n.id} className="flex items-start gap-1.5">
                    <Info className="text-muted-foreground mt-0.5 size-3 shrink-0" />
                    <span className="text-muted-foreground line-clamp-2">{n.message}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {!bridge.widget &&
            Object.keys(bridge.status).length === 0 &&
            bridge.notifies.length === 0 && (
              <div className="text-muted-foreground flex items-center gap-1">
                <ListOrdered className="size-3" /> 暂无
              </div>
            )}
        </div>
      </section>
    </div>
  );
}
