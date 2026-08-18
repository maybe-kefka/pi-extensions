import { useCallback, useEffect, useRef, useState } from "react";
import { RotateCcw, Sparkles } from "lucide-react";
import { Button } from "@/shared/ui";
import { Progress } from "@/shared/ui";
import type { RpcClient } from "@/shared/api";
import type { ContextBreakdownData } from "@/entities/chat";

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

function pct(ratio: number | null): string {
  if (ratio === null || !Number.isFinite(ratio)) return "—";
  return `${(ratio * 100).toFixed(1)}%`;
}

const CONV_ROWS: { key: keyof ContextBreakdownData["conversation"]; label: string }[] = [
  { key: "user", label: "用户" },
  { key: "assistant", label: "助手" },
  { key: "toolResult", label: "工具结果" },
  { key: "other", label: "其他" },
];

/**
 * header 上下文条点击展开的面板：总览 + 5 分类占用 + 对话细分 + compact 按钮（SPEC §7）。
 * 每次挂载（展开）重新拉取 pi:getContextBreakdown；数据源非特权，无降级问题。
 */
export function ContextPanel({
  getRequest,
  onCompact,
  processId,
}: {
  getRequest: () => RpcClient["request"];
  onCompact: () => void;
  /** 实例 processId（chat tab 弹窗——对话统计读该实例的会话） */
  processId?: string;
}) {
  const [data, setData] = useState<ContextBreakdownData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  // getRequest 用 ref（调用方可能传内联箭头——effect 依赖 ref 引用防渲染循环）
  const getRequestRef = useRef(getRequest);
  getRequestRef.current = getRequest;
  const processIdRef = useRef(processId);
  processIdRef.current = processId;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getRequestRef.current()("pi:getContextBreakdown", processIdRef.current ? { processId: processIdRef.current } : {})
      .then((d) => {
        if (cancelled) return;
        setData(d as ContextBreakdownData);
        setLoading(false);
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setError(e.message);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const retry = useCallback(() => setReloadKey((k) => k + 1), []);

  return (
    <div className="flex w-full flex-col gap-3">
      {loading ? (
        <div className="text-muted-foreground py-6 text-center text-xs">计算中…</div>
      ) : error ? (
        <div className="flex flex-col items-center gap-2 py-4">
          <span className="text-destructive text-xs">{error}</span>
          <Button size="sm" variant="outline" onClick={retry}>
            <RotateCcw data-icon="inline-start" /> 重试
          </Button>
        </div>
      ) : data ? (
        <>
          {/* 总览 */}
          <div className="flex items-baseline justify-between gap-2 border-b pb-2">
            <span className="text-muted-foreground shrink-0 text-xs">总占用</span>
            <span className="shrink-0 whitespace-nowrap text-xs tabular-nums">
              <span className="text-sm font-semibold">{fmt(data.total)}</span>
              <span className="text-muted-foreground">
                {" "}
                / {data.usage?.contextWindow ? fmt(data.usage.contextWindow) : "—"} ·{" "}
                {pct(data.usage?.percent ?? null)}
              </span>
            </span>
          </div>

          {/* 5 分类（比例相对面板内部 total，与 /status 口径一致） */}
          <div className="flex flex-col gap-1.5">
            {data.categories.map((c) => {
              const ratio = data.total > 0 ? c.tokens / data.total : 0;
              return (
                <div key={c.key} className="flex items-center gap-2">
                  <span className="w-16 shrink-0 truncate text-xs">{c.label}</span>
                  <Progress value={ratio * 100} className="h-1.5 min-w-0 flex-1" />
                  <span className="shrink-0 text-right text-xs tabular-nums">{fmt(c.tokens)}</span>
                  <span className="text-muted-foreground w-10 shrink-0 text-right text-xs tabular-nums">
                    {pct(ratio)}
                  </span>
                </div>
              );
            })}
          </div>

          {/* 对话细分 */}
          <div className="flex flex-col gap-1 border-t pt-2">
            {CONV_ROWS.map(({ key, label }) => {
              const tokens = data.conversation[key];
              const ratio = data.conversation.total > 0 ? tokens / data.conversation.total : 0;
              return (
                <div key={key} className="flex items-center gap-2 pl-6">
                  <span className="text-muted-foreground w-16 shrink-0 truncate text-xs">{label}</span>
                  <Progress value={ratio * 100} className="bg-foreground/10 h-1.5 min-w-0 flex-1" />
                  <span className="text-muted-foreground shrink-0 text-right text-xs tabular-nums">
                    {fmt(tokens)}
                  </span>
                  <span className="text-muted-foreground w-10 shrink-0 text-right text-xs tabular-nums">
                    {pct(ratio)}
                  </span>
                </div>
              );
            })}
          </div>

          <Button size="sm" className="w-full" onClick={onCompact}>
            <Sparkles data-icon="inline-start" /> 压缩上下文
          </Button>
        </>
      ) : null}
    </div>
  );
}
