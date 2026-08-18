import { describe, expect, it } from "vitest";
import { usageTier, usagePercent } from "./usage-tier.js";

describe("usage-tier（context meter 分级）", () => {
  it("<60% → ok；60-85% → warn；>85% → danger", () => {
    expect(usageTier(0.1)).toBe("ok");
    expect(usageTier(0.599)).toBe("ok");
    expect(usageTier(0.6)).toBe("warn");
    expect(usageTier(0.85)).toBe("danger");
    expect(usageTier(0.9)).toBe("danger");
  });

  it("null/非法 → ok（无数据不告警）", () => {
    expect(usageTier(null)).toBe("ok");
    expect(usageTier(NaN)).toBe("ok");
  });

  it("usagePercent：0-1 归一（服务端 0-100 兼容）", () => {
    expect(usagePercent(0.5)).toBe(0.5);
    expect(usagePercent(50)).toBe(0.5);
    expect(usagePercent(null)).toBe(0);
    expect(usagePercent(120)).toBe(1);
    expect(usagePercent(-5)).toBe(0);
  });
});
