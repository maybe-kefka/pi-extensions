/** 水杯水位分级（纯函数）：percent 0-1（服务端 0-100 兼容归一） */
export type UsageTier = "ok" | "warn" | "danger";

export function usagePercent(value: number | null | undefined): number {
  if (value == null || Number.isNaN(value)) return 0;
  if (value > 1 && value <= 100) value = value / 100; // 服务端 0-100 格式兼容
  return Math.min(1, Math.max(0, value));
}

export function usageTier(percent: number | null | undefined): UsageTier {
  const p = usagePercent(percent);
  if (p >= 0.85) return "danger";
  if (p >= 0.6) return "warn";
  return "ok";
}
