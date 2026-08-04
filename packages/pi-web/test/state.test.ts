import { describe, expect, it } from "vitest";
import { buildState, normalizePercent } from "../src/state.js";

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
  };

  it("完整输入 → 归一化输出", () => {
    expect(buildState(base)).toEqual({
      sessionFile: "/s.jsonl",
      sessionId: "s1",
      sessionName: "my work",
      model: { provider: "anthropic", id: "claude-x", name: "Claude X" },
      thinkingLevel: "high",
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
