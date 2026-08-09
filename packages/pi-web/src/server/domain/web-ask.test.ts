import { describe, expect, it, vi } from "vitest";
import { afterEach } from "vitest";
import { ASK_TIMEOUT_MS, askAndWait, createAskRegistry, serializeAskResult, type AskResult } from "./web-ask.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("R25 web-ask registry", () => {
  it("register → answer：resolve answered 结果；幂等（二次 answer false）", () => {
    const r = createAskRegistry();
    const spy = vi.fn<(v: AskResult) => void>();
    r.register("t1", spy);
    expect(r.pendingCount).toBe(1);
    expect(r.answer("t1", "选项B")).toBe(true);
    expect(spy).toHaveBeenCalledWith({ status: "answered", answer: "选项B" });
    expect(r.pendingCount).toBe(0);
    expect(r.answer("t1", "again")).toBe(false);
  });

  it("超时：resolve timeout（默认 10 分钟），之后 answer 失效", () => {
    vi.useFakeTimers();
    const r = createAskRegistry();
    const spy = vi.fn<(v: AskResult) => void>();
    r.register("t1", spy);
    vi.advanceTimersByTime(ASK_TIMEOUT_MS + 1);
    expect(spy).toHaveBeenCalledWith({ status: "timeout" });
    expect(r.pendingCount).toBe(0);
    expect(r.answer("t1", "x")).toBe(false);
  });

  it("abort：resolve cancelled（幂等）", () => {
    const r = createAskRegistry();
    const spy = vi.fn<(v: AskResult) => void>();
    r.register("t1", spy);
    expect(r.abort("t1")).toBe(true);
    expect(spy).toHaveBeenCalledWith({ status: "cancelled" });
    expect(r.abort("t1")).toBe(false);
  });

  it("askAndWait：answer 后 resolve content 文本与 details", async () => {
    const r = createAskRegistry();
    const p = askAndWait(r, "t1", undefined);
    expect(r.pendingCount).toBe(1);
    expect(r.answer("t1", 42)).toBe(true);
    const out = await p;
    expect(out.details).toEqual({ status: "answered", answer: 42 });
    // 友好文本：用户选择直读（非 raw JSON）
    expect(out.content[0].text).toContain("你的选择：42");
  });

  it("serializeAskResult 友好文本", () => {
    expect(serializeAskResult({ status: "answered", answer: "先跑测试" })).toBe("✅ 用户已回答。\n你的选择：先跑测试");
    expect(serializeAskResult({ status: "answered", answer: ["a", "b"] })).toBe("✅ 用户已回答。\n你的选择：a、b");
    expect(serializeAskResult({ status: "timeout" })).toContain("超时");
    expect(serializeAskResult({ status: "cancelled" })).toContain("中止");
  });
});
