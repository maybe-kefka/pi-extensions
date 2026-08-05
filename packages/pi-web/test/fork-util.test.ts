import { describe, expect, it } from "vitest";
import { isStaleError, resolveUserEntryId } from "../src/fork-util.js";

describe("resolveUserEntryId — userIndex → entryId", () => {
  const entries = [
    { type: "thinking_level_change", id: "t1", thinkingLevel: "high" },
    { type: "message", id: "e1", message: { role: "user", content: "hi" } },
    { type: "message", id: "e2", message: { role: "assistant", content: "hello" } },
    { type: "message", id: "e3", message: { role: "toolResult", toolCallId: "tc1" } },
    { type: "message", id: "e4", message: { role: "user", content: "again" } },
    { type: "message", id: "e5", message: { role: "assistant", content: "bye" } },
  ];

  it("按顺序数 user 消息（0-based），跳过非 user 条目", () => {
    expect(resolveUserEntryId(entries, 0)).toBe("e1");
    expect(resolveUserEntryId(entries, 1)).toBe("e4");
  });

  it("越界 → null", () => {
    expect(resolveUserEntryId(entries, 2)).toBeNull();
    expect(resolveUserEntryId(entries, 99)).toBeNull();
  });

  it("负数 → null", () => {
    expect(resolveUserEntryId(entries, -1)).toBeNull();
  });

  it("空/非数组 → null", () => {
    expect(resolveUserEntryId([], 0)).toBeNull();
    expect(resolveUserEntryId(null as never, 0)).toBeNull();
    expect(resolveUserEntryId(undefined as never, 0)).toBeNull();
  });

  it("缺 id 的 user entry → null", () => {
    expect(resolveUserEntryId([{ type: "message", message: { role: "user" } }], 0)).toBeNull();
  });

  it("无 user 消息 → null", () => {
    expect(resolveUserEntryId([{ type: "message", id: "a", message: { role: "assistant" } }], 0)).toBeNull();
  });

  it("非 message 类型 / 缺 message 字段不计数", () => {
    const messy = [
      { type: "custom", id: "c1" },
      { type: "message", id: "m1" },
      { type: "message", id: "m2", message: { role: "user" } },
    ];
    expect(resolveUserEntryId(messy, 0)).toBe("m2");
  });
});

describe("isStaleError — 捕获 ctx 失效判定", () => {
  it("错误消息含 stale → true", () => {
    expect(
      isStaleError(new Error("This extension ctx is stale after session replacement or reload. Do not use a captured pi or command ctx...")),
    ).toBe(true);
  });

  it("普通错误 → false", () => {
    expect(isStaleError(new Error("model not found"))).toBe(false);
  });

  it("非 Error 输入 → false", () => {
    expect(isStaleError("stale string")).toBe(false);
    expect(isStaleError(undefined)).toBe(false);
    expect(isStaleError(null)).toBe(false);
  });
});
