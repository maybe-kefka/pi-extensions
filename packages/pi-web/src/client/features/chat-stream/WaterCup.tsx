import { usagePercent, usageTier } from "@/entities/chat/usage-tier";

const TIER_COLOR: Record<string, string> = {
  ok: "bg-emerald-500",
  warn: "bg-amber-500",
  danger: "bg-red-500",
};

/** 垂直水杯进度条（chat input 左侧）：圆角容器 + 水位从底往上 + 分级变色 */
export function WaterCup({ percent }: { percent: number | null | undefined }) {
  const p = usagePercent(percent);
  const tier = usageTier(p);
  const label = `${(p * 100).toFixed(1)}%`;
  return (
    <div
      title={`上下文占用 ${label}`}
      className="bg-muted relative h-10 w-3.5 shrink-0 overflow-hidden rounded-md"
      role="progressbar"
      aria-valuenow={Math.round(p * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        data-water
        className={`${TIER_COLOR[tier]} absolute bottom-0 left-0 right-0 rounded-t-sm transition-all duration-500`}
        style={{ height: `${Math.max(2, p * 100)}%` }}
      />
    </div>
  );
}
