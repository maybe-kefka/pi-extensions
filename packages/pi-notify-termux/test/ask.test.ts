import { describe, expect, it } from "vitest";
import { cancelAsk, checkTimeout, createAsk, resolveAsk, serializeResult } from "../src/ask.js";

const NOW = 1_000_000;

describe("createAsk", () => {
  it("computes deadline from timeoutMs", () => {
    const ask = createAsk({ id: "a1", question: "继续吗？", timeoutMs: 300_000, now: NOW });
    expect(ask).toMatchObject({ id: "a1", question: "继续吗？", deadline: NOW + 300_000, result: null });
  });

  it("never times out when timeoutMs is 0", () => {
    const ask = createAsk({ id: "a2", question: "q", timeoutMs: 0, now: NOW });
    expect(ask.deadline).toBeNull();
  });
});

describe("resolveAsk", () => {
  it("resolves with selection for option replies", () => {
    const ask = createAsk({ id: "a1", question: "继续吗？", timeoutMs: 0, now: NOW });
    const r = resolveAsk(ask, { selection: 2, option: "跳过", text: "跳过" }, NOW + 10);
    expect(r).toEqual({ status: "answered", selection: 2, option: "跳过", text: "跳过" });
  });

  it("resolves with text for free input", () => {
    const ask = createAsk({ id: "a2", question: "请输入", timeoutMs: 0, now: NOW });
    const r = resolveAsk(ask, { selection: null, option: null, text: "自定义内容" }, NOW + 10);
    expect(r).toEqual({ status: "answered", selection: null, option: null, text: "自定义内容" });
  });

  it("is idempotent after termination", () => {
    const ask = createAsk({ id: "a1", question: "q", timeoutMs: 0, now: NOW });
    const first = resolveAsk(ask, { selection: 1, option: "继续", text: "继续" }, NOW);
    expect(first).not.toBeNull();
    expect(resolveAsk(ask, { selection: 2, option: "X", text: "X" }, NOW)).toBeNull();
    expect(cancelAsk(ask, NOW)).toBeNull();
  });
});

describe("cancelAsk", () => {
  it("cancels a pending ask", () => {
    const ask = createAsk({ id: "a1", question: "q", timeoutMs: 0, now: NOW });
    expect(cancelAsk(ask, NOW)).toEqual({ status: "cancelled" });
  });
});

describe("checkTimeout", () => {
  it("returns timeout result once deadline passes", () => {
    const ask = createAsk({ id: "a1", question: "q", timeoutMs: 300, now: NOW });
    expect(checkTimeout(ask, NOW + 299)).toBeNull();
    expect(checkTimeout(ask, NOW + 300)).toEqual({ status: "timeout" });
    expect(checkTimeout(ask, NOW + 999)).toEqual({ status: "timeout" });
  });

  it("never times out with null deadline", () => {
    const ask = createAsk({ id: "a2", question: "q", timeoutMs: 0, now: NOW });
    expect(checkTimeout(ask, NOW + 1_000_000)).toBeNull();
  });

  it("ignores terminated asks", () => {
    const ask = createAsk({ id: "a3", question: "q", timeoutMs: 300, now: NOW });
    resolveAsk(ask, { selection: 1, option: "继续", text: "继续" }, NOW);
    expect(checkTimeout(ask, NOW + 999)).toBeNull();
  });
});

describe("serializeResult", () => {
  it("echoes question in every status", () => {
    expect(serializeResult({ status: "answered", selection: 1, option: "继续", text: "继续" }, "继续吗？"))
      .toEqual({ status: "answered", question: "继续吗？", selection: 1, option: "继续", text: "继续" });
    expect(serializeResult({ status: "timeout" }, "继续吗？"))
      .toEqual({ status: "timeout", question: "继续吗？" });
    expect(serializeResult({ status: "cancelled" }, "继续吗？"))
      .toEqual({ status: "cancelled", question: "继续吗？" });
  });
});
