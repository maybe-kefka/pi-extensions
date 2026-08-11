import { describe, expect, it } from "vitest";
import { messageTextOf, messageThinkingOf, messageToolCalls } from "../domain/message-accessors.js";

describe("messageToolCalls / messageTextOf / messageThinkingOf", () => {
  it("提取 toolCall 块（id/name/arguments）", () => {
    const content = [
      { type: "thinking", thinking: "想" },
      { type: "toolCall", id: "t1", name: "bash", arguments: { command: "ls" } },
      { type: "toolCall", id: "t2", name: "read", arguments: { path: "/x" } },
    ];
    expect(messageToolCalls(content)).toEqual([
      { id: "t1", name: "bash", arguments: { command: "ls" } },
      { id: "t2", name: "read", arguments: { path: "/x" } },
    ]);
  });

  it("无 toolCall → 空数组；缺 id 跳过", () => {
    expect(messageToolCalls([{ type: "text", text: "hi" }])).toEqual([]);
    expect(messageToolCalls([{ type: "toolCall", name: "x", arguments: {} }])).toEqual([]);
    expect(messageToolCalls("str")).toEqual([]);
  });

  it("text 提取过滤空块（thinking+toolCall 无 text → 空串）", () => {
    expect(messageTextOf([{ type: "thinking", thinking: "x" }, { type: "toolCall", id: "t", name: "x", arguments: {} }])).toBe("");
    expect(messageTextOf([{ type: "text", text: "a" }, { type: "text", text: "b" }])).toBe("a\nb");
    expect(messageTextOf("plain")).toBe("plain");
  });

  it("thinking 提取", () => {
    expect(messageThinkingOf([{ type: "thinking", thinking: "思考中" }])).toBe("思考中");
    expect(messageThinkingOf([{ type: "text", text: "x" }])).toBe("");
  });
});
