// @vitest-environment jsdom
// R23 F2：per-bubble 工具行过滤 + 引用稳定缓存
import { describe, expect, it } from "vitest";
import { toolsForBubble } from "./tools-for-bubble";
import type { ToolRow, TurnBubble } from "@/entities/chat/stream";

function row(id: string, output = ""): ToolRow {
  return { toolCallId: id, toolName: "bash", args: null, output, isError: false, final: true, expanded: false };
}

function bubble(toolCallIds: string[]): TurnBubble {
  return {
    id: "b1",
    userIndex: 0,
    userText: "q",
    userFinal: true,
    turns: toolCallIds.map((id) => ({
      text: "",
      thinking: "",
      toolCallIds: [id],
      steps: [{ type: "tool", toolCallId: id }],
      final: true,
    })),
  };
}

describe("toolsForBubble", () => {
  it("按气泡 toolCallIds 过滤相关行", () => {
    const rows = [row("t1", "a"), row("t2", "b"), row("t3", "c")];
    const b = bubble(["t1", "t3"]);
    const got = toolsForBubble(b, rows, new Map());
    expect(got.map((r) => r.toolCallId)).toEqual(["t1", "t3"]);
  });

  it("相关行元素引用未变时返回缓存数组（引用稳定）", () => {
    const rows = [row("t1", "a"), row("t2", "b")];
    const b = bubble(["t1"]);
    const cache = new Map<string, ToolRow[]>();
    const first = toolsForBubble(b, rows, cache);
    // 其他行的 output 更新（t2 更新）→ 本气泡相关行（t1）元素引用未变 → 返回缓存
    const rows2 = [rows[0], { ...rows[1], output: "b2" }];
    const second = toolsForBubble(b, rows2, cache);
    expect(second).toBe(first);
  });

  it("相关行更新后返回新数组（缓存失效）", () => {
    const rows = [row("t1", "a")];
    const b = bubble(["t1"]);
    const cache = new Map<string, ToolRow[]>();
    const first = toolsForBubble(b, rows, cache);
    const rows2 = [{ ...rows[0], output: "a2" }];
    const second = toolsForBubble(b, rows2, cache);
    expect(second).not.toBe(first);
    expect(second[0].output).toBe("a2");
  });
});
