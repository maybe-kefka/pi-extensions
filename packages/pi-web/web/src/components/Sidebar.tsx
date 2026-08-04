import { useEffect, useState } from "react";
import type * as React from "react";
import { Info, ListOrdered, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import type { CommandInfo, ModelInfo, SessionInfo } from "@/lib/types";
import type { StreamState } from "@/lib/stream";


export interface SidebarContentProps {
  sessions: SessionInfo[];
  currentSessionFile: string | null;
  models: ModelInfo[];
  currentModel: string | null;
  thinkingLevel: string | null;
  thinkingLevels: string[];
  commands: CommandInfo[];
  bridge: StreamState["bridge"];
  onSetModel: (provider: string, modelId: string) => void;
  onSetThinking: (level: string) => void;
}

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

/** 面板内容（宽屏侧栏与窄屏抽屉共用） */
export function SidebarContent(props: SidebarContentProps) {
  const {
    sessions,
    currentSessionFile,
    models,
    currentModel,
    thinkingLevel,
    thinkingLevels,
    commands,
    bridge,
    onSetModel,
    onSetThinking,
  } = props;
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <>
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
            <RefreshCw />
          </Button>
        }
      >
        <div className="text-muted-foreground text-xs">切换仅支持 TUI（/resume、/new）</div>
        <ScrollArea className="mt-2 h-40">
          <ul className="flex flex-col gap-1">
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
            <SelectGroup>
              {models.map((m) => (
                <SelectItem key={`${m.provider}/${m.id}`} value={`${m.provider}/${m.id}`}>
                  {m.name} ({m.provider})
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Panel>

      <Panel title="思考等级">
        <Select value={thinkingLevel ?? undefined} onValueChange={onSetThinking}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {thinkingLevels.length === 0 && <SelectItem value="off">off</SelectItem>}
              {thinkingLevels.map((lvl) => (
                <SelectItem key={lvl} value={lvl}>
                  {lvl}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Panel>

      <Panel title="命令（只读）">
        <ScrollArea className="h-36">
          <ul className="flex flex-col gap-1.5">
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
          {!bridge.widget && Object.keys(bridge.status).length === 0 && bridge.notifies.length === 0 && (
            <div className="text-muted-foreground flex items-center gap-1">
              <ListOrdered className="size-3" /> 暂无
            </div>
          )}
        </div>
      </Panel>
    </>
  );
}

/** 宽屏侧栏（≥lg 显示，可折叠） */
export function Sidebar({ collapsed, ...props }: SidebarContentProps & { collapsed: boolean }) {
  if (collapsed) return null;
  return (
    <aside className="hidden w-72 shrink-0 flex-col overflow-y-auto border-l p-3 lg:flex">
      <div className="flex flex-col gap-3">
        <SidebarContent {...props} />
      </div>
    </aside>
  );
}

/** 窄屏抽屉（<lg 显示） */
export function SidebarSheet({
  open,
  onOpenChange,
  ...props
}: SidebarContentProps & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[85%] max-w-sm p-0 sm:w-80">
        <SheetTitle className="sr-only">面板</SheetTitle>
        <div className="h-full overflow-y-auto p-3 pb-[env(safe-area-inset-bottom)]">
          <SidebarContent {...props} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
