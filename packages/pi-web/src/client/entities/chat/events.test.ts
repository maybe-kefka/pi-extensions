import { describe, expect, it } from "vitest";
import { isTransitionalAction, toAction } from "./events";
import type { StreamAction } from "./stream";

describe("toAction：服务器 pi:event → reducer action 映射", () => {
  it("R20 回归：session_before_compact / session_compact 不再被丢弃", () => {
    expect(toAction({ type: "session_before_compact", reason: "threshold", willRetry: true } as never)).toEqual({
      type: "session_before_compact",
      reason: "threshold",
      willRetry: true,
    });
    expect(
      toAction({ type: "session_compact", reason: "manual", willRetry: false, fromExtension: false } as never),
    ).toEqual({
      type: "session_compact",
      reason: "manual",
      willRetry: false,
      fromExtension: false,
    });
  });

  it("reason 缺失 → null；willRetry 严格布尔", () => {
    expect(toAction({ type: "session_before_compact" } as never)).toEqual({
      type: "session_before_compact",
      reason: null,
      willRetry: false,
    });
  });

  it("消息/工具事件映射保持", () => {
    expect(toAction({ type: "message_start", message: { role: "user", content: "q" } } as never)).toEqual({
      type: "message_start",
      message: { role: "user", content: "q" },
    });
    expect(
      toAction({ type: "tool_execution_start", toolCallId: "t1", toolName: "bash", args: {} } as never),
    ).toEqual({ type: "tool_start", toolCallId: "t1", toolName: "bash", args: {} });
    expect(toAction({ type: "agent_end", willRetry: true } as never)).toEqual({ type: "agent_end", willRetry: true });
  });

  it("未知事件 → null（丢弃）", () => {
    expect(toAction({ type: "unknown_event" } as never)).toBeNull();
  });
});

describe("R23 F5 isTransitionalAction", () => {
  it("高频流式事件为 true", () => {
    expect(isTransitionalAction({ type: "message_update", event: { type: "text_delta", delta: "a" } })).toBe(true);
    expect(isTransitionalAction({ type: "message_update", event: { type: "thinking_delta", delta: "a" } })).toBe(true);
    expect(isTransitionalAction({ type: "tool_update", toolCallId: "t", partialResult: null })).toBe(true);
  });

  it("消息边界/连接/历史等事件为 false", () => {
    for (const action of [
      { type: "message_start", message: {} },
      { type: "message_end", message: {} },
      { type: "turn_start" },
      { type: "turn_end" },
      { type: "history", messages: [] },
      { type: "conn", state: "open" },
      { type: "agent_start" },
      { type: "agent_end", willRetry: false },
      { type: "queue_update", steering: [], followUp: [] },
      { type: "state", state: {} },
      { type: "session_start" },
      { type: "notify", message: "x", notifyType: "info" },
      { type: "setStatus", statusKey: "k", statusText: "v" },
      { type: "setWidget", widgetKey: "k", widgetLines: null },
      { type: "message_update", event: { type: "text_start", contentIndex: 0 } },
    ] satisfies StreamAction[]) {
      expect(isTransitionalAction(action)).toBe(false);
    }
  });
});
