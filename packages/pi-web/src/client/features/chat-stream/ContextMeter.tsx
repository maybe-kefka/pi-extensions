import { CircleAlert, CircleCheck, TriangleAlert } from "lucide-react";
import { usagePercent, usageTier, type UsageTier } from "@/entities/chat";

const TIER_COLOR: Record<UsageTier, string> = {
  ok: "bg-success",
  warn: "bg-warning",
  danger: "bg-destructive",
};

/** Chat composer 的上下文用量：可扫读的百分比 + 进度语义。 */
export function ContextMeter({ percent }: { percent: number | null | undefined }) {
  const normalizedPercent = usagePercent(percent);
  const tier = usageTier(normalizedPercent);
  const hasValue = typeof percent === "number" && Number.isFinite(percent);
  const label = hasValue ? `${Math.round(normalizedPercent * 100)}%` : "—";
  const TierIcon = tier === "ok" ? CircleCheck : tier === "warn" ? TriangleAlert : CircleAlert;
  return (
    <div
      title={`上下文占用 ${label}`}
      className="flex h-7 min-w-36 shrink-0 items-center gap-2 rounded-lg px-1"
      role="progressbar"
      aria-label="上下文"
      aria-valuenow={hasValue ? Math.round(normalizedPercent * 100) : undefined}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuetext={hasValue ? `${label} 已使用` : "暂无上下文数据"}
    >
      <span className="text-muted-foreground text-xs">上下文</span>
      <TierIcon aria-hidden="true" className="text-muted-foreground size-3.5 shrink-0" />
      <span className="bg-sunken h-1.5 min-w-8 flex-1 overflow-hidden rounded-full">
        <span
          data-slot="context-meter-fill"
          className={`${TIER_COLOR[tier]} block h-full rounded-full transition-[width,background-color] duration-150`}
          style={{ width: `${Math.max(hasValue ? 2 : 0, normalizedPercent * 100)}%` }}
        />
      </span>
      <span className="text-foreground min-w-8 text-right text-xs tabular-nums">{label}</span>
    </div>
  );
}
