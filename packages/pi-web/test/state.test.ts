import { describe, expect, it } from "vitest";
import { buildState, normalizePercent, supportedThinkingLevels } from "../src/state.js";

describe("normalizePercent", () => {
  it("0-100 → 0-1", () => {
    expect(normalizePercent(0)).toBe(0);
    expect(normalizePercent(50)).toBe(0.5);
    expect(normalizePercent(100)).toBe(1);
  });

  it("null / 非有限 → null", () => {
    expect(normalizePercent(null)).toBeNull();
    expect(normalizePercent(Number.NaN)).toBeNull();
    expect(normalizePercent(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("clamp [0,1]", () => {
    expect(normalizePercent(-5)).toBe(0);
    expect(normalizePercent(150)).toBe(1);
  });
});

describe("supportedThinkingLevels", () => {
  const ALL = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];

  it("无模型 → 全集（前端兜底）", () => {
    expect(supportedThinkingLevels(null, ALL)).toEqual(ALL);
  });

  it("非 reasoning 模型 → [off]", () => {
    expect(supportedThinkingLevels({ provider: "p", id: "m", reasoning: false }, ALL)).toEqual(["off"]);
  });

  it("reasoning 模型无 thinkingLevelMap → 全可用（xhigh/max 除外，需显式声明）", () => {
    const levels = supportedThinkingLevels({ provider: "p", id: "m", reasoning: true }, ALL);
    expect(levels).toEqual(["off", "minimal", "low", "medium", "high"]);
  });

  it("thinkingLevelMap null 标记 → 排除；xhigh/max 仅显式声明可用", () => {
    const model = {
      provider: "p",
      id: "m",
      reasoning: true,
      thinkingLevelMap: { medium: null, high: "high", xhigh: "xhigh" },
    };
    expect(supportedThinkingLevels(model, ALL)).toEqual(["off", "minimal", "low", "high", "xhigh"]);
  });

  it("空 allLevels 不崩溃", () => {
    expect(supportedThinkingLevels(null, [])).toEqual([]);
  });
});

describe("buildState", () => {
  const base: Parameters<typeof buildState>[0] = {
    sessionFile: "/s.jsonl",
    sessionId: "s1",
    sessionName: "my work",
    model: { provider: "anthropic", id: "claude-x", name: "Claude X" },
    thinkingLevel: "high",
    isStreaming: false,
    contextUsage: { tokens: 60000, contextWindow: 200000, percent: 30 },
    messageCount: 22,
    allThinkingLevels: ["off", "minimal", "low", "medium", "high", "xhigh", "max"],
  };

  it("完整输入 → 归一化输出（含 availableThinkingLevels）", () => {
    expect(buildState(base)).toEqual({
      sessionFile: "/s.jsonl",
      sessionId: "s1",
      sessionName: "my work",
      model: { provider: "anthropic", id: "claude-x", name: "Claude X" },
      thinkingLevel: "high",
      availableThinkingLevels: ["off", "minimal", "low", "medium", "high"],
      isStreaming: false,
      context: { tokens: 60000, contextWindow: 200000, percent: 0.3 },
      messageCount: 22,
    });
  });

  it("sessionName undefined → null；model name 缺失 → null", () => {
    const s = buildState({ ...base, sessionName: undefined, model: { provider: "p", id: "m" } });
    expect(s.sessionName).toBeNull();
    expect(s.model?.name).toBeNull();
  });

  it("contextUsage null / tokens null → context 全 null", () => {
    const s1 = buildState({ ...base, contextUsage: null });
    expect(s1.context).toEqual({ tokens: null, contextWindow: null, percent: null });
    const s2 = buildState({ ...base, contextUsage: { tokens: null, contextWindow: null, percent: null } });
    expect(s2.context.percent).toBeNull();
  });

  it("model null / thinkingLevel null 透传", () => {
    const s = buildState({ ...base, model: null, thinkingLevel: null });
    expect(s.model).toBeNull();
    expect(s.thinkingLevel).toBeNull();
  });
});
