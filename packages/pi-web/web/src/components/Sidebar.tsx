import { useEffect, useState } from "react";
import type * as React from "react";
import { Info, ListOrdered, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import type { CommandInfo, ModelInfo, SessionInfo } from "@/lib/types";
import type { StreamState } from "@/lib/stream";

const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];

function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card className="gap-2 py-3">
      <CardHeader className="flex-row items-center justify-between px-4 py-0">
        <CardTitle className="text-xs font-semibold tracking-wide uppercase">{title}</CardTitle>
        {action}
      </CardHeader>
      <CardContent className="px-4">{children}</CardContent>
    </Card>
  );
}

export function Sidebar(props: {
  sessions: SessionInfo[];
  currentSessionFile: string | null;
  models: ModelInfo[];
  currentModel: string | null;
  thinkingLevel: string | null;
  commands: CommandInfo[];
  bridge: StreamState["bridge"];
  onSetModel: (provider: string, modelId: string) => void;
  onSetThinking: (level: string) => void;
}) {
  const { sessions, currentSessionFile, models, currentModel, thinkingLevel, commands, bridge, onSetModel, onSetThinking } = props;
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <aside className="w-72 shrink-0 space-y-3 overflow-y-auto border-l p-3">
      <Panel
        title="会话"
        action={
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            title="刷新"
            onClick={() => setRefreshKey((k) => k + 1)}
          >
            <RefreshCw className="size-3.5" />
          </Button>
        }
      >
        <div className="text-muted-foreground text-xs">切换仅支持 TUI（/resume、/new）</div>
        <ScrollArea className="mt-2 h-40">
          <ul className="space-y-1">
            {sessions.map((s) => {
              const active = currentSessionFile === s.path;
              return (
                <li key={s.path} className="flex items-center gap-2 text-xs">
                  <span className={`truncate ${active ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                    {s.name || s.firstMessage || s.path.split("/").pop()}
                  </span>
                  <span className="text-muted-foreground ml-auto shrink-0 tabular-nums">{s.messageCount}条</span>
                  {active && <Badge variant="secondary">当前</Badge>}
                </li>
              );
            })}
            {sessions.length === 0 && <li className="text-muted-foreground text-xs">暂无会话</li>}
          </ul>
        </ScrollArea>
      </Panel>

      <Panel title="模型">
        <Select
          value={currentModel ?? undefined}
          onValueChange={(v) => {
            const idx = v.lastIndexOf("/");
            onSetModel(v.slice(0, idx), v.slice(idx + 1));
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="加载中…" />
          </SelectTrigger>
          <SelectContent>
            {models.map((m) => (
              <SelectItem key={`${m.provider}/${m.id}`} value={`${m.provider}/${m.id}`}>
                {m.name} ({m.provider})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Panel>

      <Panel title="思考等级">
        <Select
          value={thinkingLevel ?? undefined}
          onValueChange={onSetThinking}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            {THINKING_LEVELS.map((lvl) => (
              <SelectItem key={lvl} value={lvl}>
                {lvl}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Panel>

      <Panel title="命令（只读）">
        <ScrollArea className="h-36">
          <ul className="space-y-1.5">
            {commands.map((c) => (
              <li key={c.name} className="text-xs">
                <div className="font-medium">/{c.name}</div>
                <div className="text-muted-foreground line-clamp-2">{c.description || c.source}</div>
              </li>
            ))}
            {commands.length === 0 && <li className="text-muted-foreground text-xs">无命令</li>}
          </ul>
        </ScrollArea>
      </Panel>

      <Panel title="状态桥接">
        <div className="space-y-2 text-xs">
          {bridge.widget && (
            <pre className="border-border bg-muted/50 rounded border p-2 whitespace-pre-wrap font-mono text-[11px]">
              {bridge.widget.lines.join("\n")}
            </pre>
          )}
          {Object.entries(bridge.status).length > 0 && (
            <ul className="space-y-1">
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
              <ul className="space-y-1">
                {bridge.notifies.map((n) => (
                  <li key={n.id} className="flex items-start gap-1.5">
                    <Info className="text-muted-foreground mt-0.5 size-3 shrink-0" />
                    <span className="text-muted-foreground line-clamp-2">{n.message}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {!bridge.widget && Object.keys(bridge.status).length === 0 && bridge.notifies.length === 0 && (
            <div className="text-muted-foreground flex items-center gap-1">
              <ListOrdered className="size-3" /> 暂无
            </div>
          )}
        </div>
      </Panel>
    </aside>
  );
}
