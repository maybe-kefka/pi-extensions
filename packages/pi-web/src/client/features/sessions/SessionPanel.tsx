import { useEffect, useState } from "react";
import { Info, ListOrdered, RefreshCw } from "lucide-react";
import { Button } from "@/shared/ui";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui";
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
    <div className="scrollbar-thin scrollbar-gutter-stable flex h-full flex-col gap-3 overflow-y-auto p-3">
      <Card className="gap-2 py-3">
        <div className="flex items-center justify-between px-4">
          <span className="text-xs font-semibold tracking-wide uppercase">会话</span>
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            title="刷新"
            onClick={() => setRefreshKey((k) => k + 1)}
          >
            <RefreshCw />
          </Button>
        </div>
        <CardContent className="px-4">
          <SessionList
            sessions={sessions}
            currentSessionFile={currentSessionFile}
            openSessionFiles={openSessionFiles}
            degraded={sessionDegraded}
            actions={sessionActions}
          />
        </CardContent>
      </Card>

      <Card className="gap-2 py-3">
        <CardHeader className="px-4 py-0">
          <CardTitle className="text-xs font-semibold tracking-wide uppercase">状态桥接</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-xs">
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
        </CardContent>
      </Card>
    </div>
  );
}
