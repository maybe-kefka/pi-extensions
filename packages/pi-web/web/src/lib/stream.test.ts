import { describe, expect, it } from "vitest";
import {
  bubbleStreaming,
  bubbleThinking,
  bubbleToolCallIds,
  initialState,
  streamReducer,
  textOfContent,
  thinkingOfContent,
  toolCallIdsOf,
  type StreamAction,
  type StreamState,
} from "./stream";

function reduce(actions: StreamAction[], from: StreamState = initialState): StreamState {
  return actions.reduce(streamReducer, from);
}

describe("辅助函数", () => {
  it("textOfContent / thinkingOfContent / toolCallIdsOf", () => {
    expect(textOfContent("hi")).toBe("hi");
    expect(textOfContent([{ type: "text", text: "a" }, { type: "text", text: "" }, { type: "other" }])).toBe("a");
    expect(thinkingOfContent([{ type: "thinking", thinking: "想" }, { type: "text", text: "x" }])).toBe("想");
    expect(
      toolCallIdsOf([{ type: "toolCall", id: "t1" }, { type: "text", text: "x" }, { type: "toolCall", id: "t2" }]),
    ).toEqual(["t1", "t2"]);
  });

  it("bubbleStreaming / bubbleThinking / bubbleToolCallIds", () => {
    const b = {
      id: "b1",
      userIndex: 0,
      userText: "q",
      userFinal: true,
      turns: [
        { text: "a", thinking: "想1", toolCallIds: ["t1"], final: true },
        { text: "b", thinking: "想2", toolCallIds: ["t2", "t1"], final: false },
      ],
    };
    expect(bubbleStreaming(b)).toBe(true);
    expect(bubbleThinking(b)).toBe("想1\n\n想2");
    expect(bubbleToolCallIds(b)).toEqual(["t1", "t2"]);
  });
});

describe("history 回填", () => {
  it("user（带 userIndex）开气泡、assistant 归入最近气泡、多 turn 聚合", () => {
    const state = reduce([
      {
        type: "history",
        messages: [
          { role: "user", text: "q1", userIndex: 0 },
          { role: "assistant", text: "a1", thinking: "想1", toolCalls: [{ id: "t1", name: "bash", arguments: {} }] },
          { role: "assistant", text: "a2" },
          { role: "user", text: "q2", userIndex: 1 },
          { role: "assistant", text: "a3" },
        ],
      },
    ]);
    expect(state.bubbles).toHaveLength(2);
    expect(state.bubbles[0].userText).toBe("q1");
    expect(state.bubbles[0].turns.map((t) => t.text)).toEqual(["a1", "a2"]);
    expect(state.bubbles[0].turns[0].thinking).toBe("想1");
    expect(state.bubbles[0].turns[0].toolCallIds).toEqual(["t1"]);
    expect(state.bubbles[1].userText).toBe("q2");
    expect(state.bubbles[1].turns.map((t) => t.text)).toEqual(["a3"]);
    expect(state.userCount).toBe(2);
    expect(state.tools).toHaveLength(1);
    expect(state.tools[0]).toMatchObject({ toolCallId: "t1", toolName: "bash", final: true });
  });

  it("空 assistant 消息筛除", () => {
    const state = reduce([
      { type: "history", messages: [{ role: "user", text: "q", userIndex: 0 }, { role: "assistant", text: "", thinking: "", toolCalls: [] }] },
    ]);
    expect(state.bubbles[0].turns).toHaveLength(0);
  });

  it("缺 userIndex 时按顺序续接（防御）", () => {
    const state = reduce([
      { type: "history", messages: [{ role: "user", text: "q1" }, { role: "user", text: "q2" }] },
    ]);
    expect(state.bubbles.map((b) => b.userIndex)).toEqual([0, 1]);
    expect(state.userCount).toBe(2);
  });

  it("历史开头无 user 的 assistant（异常）→ 孤儿气泡", () => {
    const state = reduce([{ type: "history", messages: [{ role: "assistant", text: "a" }] }]);
    expect(state.bubbles).toHaveLength(1);
    expect(state.bubbles[0].userIndex).toBe(-1);
  });
});

describe("流式：user 开新气泡", () => {
  it("userIndex 从 userCount 续接", () => {
    const state = reduce([
      { type: "history", messages: [{ role: "user", text: "q1", userIndex: 0 }] },
      { type: "message_start", message: { role: "user", content: "q2" } },
    ]);
    expect(state.bubbles).toHaveLength(2);
    expect(state.bubbles[1].userIndex).toBe(1);
    expect(state.bubbles[1].userText).toBe("q2");
    expect(state.bubbles[1].userFinal).toBe(false);
    expect(state.userCount).toBe(2);
  });

  it("user message_end 定稿 userText", () => {
    const state = reduce([
      { type: "message_start", message: { role: "user", content: "q" } },
      { type: "message_end", message: { role: "user", content: "q!" } },
    ]);
    expect(state.bubbles[0].userText).toBe("q!");
    expect(state.bubbles[0].userFinal).toBe(true);
  });
});

describe("流式：assistant turn 聚合", () => {
  it("assistant message_start 追加 turn，delta 累积，message_end 定稿", () => {
    const state = reduce([
      { type: "message_start", message: { role: "user", content: "q" } },
      { type: "message_start", message: { role: "assistant", content: [] } },
      { type: "message_update", event: { type: "text_delta", delta: "你" } },
      { type: "message_update", event: { type: "text_delta", delta: "好" } },
      { type: "message_update", event: { type: "thinking_delta", delta: "思", partial: { thinking: "思考中" } } },
      { type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "你好" }] } },
    ]);
    const bubble = state.bubbles[0];
    expect(bubble.turns).toHaveLength(1);
    expect(bubble.turns[0].text).toBe("你好");
    expect(bubble.turns[0].thinking).toBe("思考中");
    expect(bubble.turns[0].final).toBe(true);
    expect(bubbleStreaming(bubble)).toBe(false);
  });

  it("工具循环：多个 assistant 消息聚合进同一气泡", () => {
    const state = reduce([
      { type: "message_start", message: { role: "user", content: "q" } },
      { type: "message_start", message: { role: "assistant", content: [{ type: "toolCall", id: "t1", name: "bash", arguments: {} }] } },
      { type: "tool_start", toolCallId: "t1", toolName: "bash", args: { command: "ls" } },
      { type: "tool_end", toolCallId: "t1", result: { content: [{ type: "text", text: "out" }] }, isError: false },
      { type: "message_end", message: { role: "assistant", content: [{ type: "toolCall", id: "t1", name: "bash", arguments: {} }] } },
      { type: "message_start", message: { role: "assistant", content: [{ type: "text", text: "完成" }] } },
      { type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "完成" }] } },
    ]);
    expect(state.bubbles).toHaveLength(1);
    expect(state.bubbles[0].turns).toHaveLength(2);
    expect(state.bubbles[0].turns[0].toolCallIds).toEqual(["t1"]);
    expect(state.bubbles[0].turns[1].text).toBe("完成");
    expect(state.tools).toHaveLength(1);
    expect(state.tools[0].output).toBe("out");
  });

  it("message_end 覆盖流式文本与 thinking（最终快照权威）", () => {
    const state = reduce([
      { type: "message_start", message: { role: "user", content: "q" } },
      { type: "message_start", message: { role: "assistant", content: [] } },
      { type: "message_update", event: { type: "text_delta", delta: "流式" } },
      { type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "定稿" }] } },
    ]);
    expect(state.bubbles[0].turns[0].text).toBe("定稿");
  });

  it("空 turn（无 text/thinking/toolCall）→ 移除；孤儿气泡一并移除", () => {
    const state = reduce([
      { type: "message_start", message: { role: "assistant", content: [] } },
      { type: "message_end", message: { role: "assistant", content: [] } },
    ]);
    expect(state.bubbles).toHaveLength(0);
    expect(state.currentBubbleId).toBeNull();
  });

  it("turn_end 兜底 final 化活跃 turn", () => {
    const state = reduce([
      { type: "message_start", message: { role: "user", content: "q" } },
      { type: "message_start", message: { role: "assistant", content: [{ type: "text", text: "x" }] } },
      { type: "turn_end" },
    ]);
    expect(state.bubbles[0].turns[0].final).toBe(true);
  });

  it("message_update 在无活跃 turn 时 no-op", () => {
    const s1 = reduce([{ type: "history", messages: [{ role: "user", text: "q", userIndex: 0 }] }]);
    const s2 = streamReducer(s1, { type: "message_update", event: { type: "text_delta", delta: "x" } });
    expect(s2).toBe(s1);
  });
});

describe("agent 状态与会话切换", () => {
  it("agent_start / agent_end / agent_settled 驱动 streaming", () => {
    const s1 = reduce([{ type: "agent_start" }]);
    expect(s1.streaming).toBe(true);
    const s2 = reduce([{ type: "agent_end" }], s1);
    expect(s2.streaming).toBe(false);
    const s3 = reduce([{ type: "agent_end", willRetry: true }], s1);
    expect(s3.streaming).toBe(true);
    expect(reduce([{ type: "agent_settled" }], s3).streaming).toBe(false);
  });

  it("session_start 清空气泡/工具/userCount", () => {
    const s1 = reduce([
      { type: "message_start", message: { role: "user", content: "q" } },
      { type: "message_start", message: { role: "assistant", content: [] } },
      { type: "tool_start", toolCallId: "t", toolName: "bash", args: {} },
    ]);
    expect(s1.bubbles).toHaveLength(1);
    expect(s1.tools).toHaveLength(1);
    const s2 = reduce([{ type: "session_start", reason: "resume" }], s1);
    expect(s2.bubbles).toHaveLength(0);
    expect(s2.tools).toHaveLength(0);
    expect(s2.userCount).toBe(0);
    expect(s2.sessionReason).toBe("resume");
  });

  it("queue_update / notify / setStatus / setWidget / conn / state 保留行为", () => {
    const s = reduce([
      { type: "conn", state: "open" },
      { type: "queue_update", steering: ["s"], followUp: ["f"] },
      { type: "notify", message: "hi", notifyType: "info" },
      { type: "setStatus", statusKey: "k", statusText: "v" },
      { type: "setWidget", widgetKey: "w", widgetLines: ["l1"] },
      { type: "state", state: { isStreaming: true, sessionFile: "/s.jsonl", model: { provider: "a", id: "m", name: "M" }, thinkingLevel: "high", availableThinkingLevels: ["high", "low"], context: { tokens: 1, contextWindow: 2, percent: 0.5 }, messageCount: 3 } },
    ]);
    expect(s.conn).toBe("open");
    expect(s.queue).toEqual({ steering: ["s"], followUp: ["f"] });
    expect(s.bridge.notifies).toHaveLength(1);
    expect(s.bridge.status).toEqual({ k: "v" });
    expect(s.bridge.widget).toEqual({ key: "w", lines: ["l1"] });
    expect(s.streaming).toBe(true);
    expect(s.sessionFile).toBe("/s.jsonl");
    expect(s.model?.id).toBe("m");
    expect(s.thinkingLevel).toBe("high");
    expect(s.context.percent).toBe(0.5);
    expect(s.messageCount).toBe(3);
  });

  it("未知 action 返回原状态", () => {
    const s = reduce([{ type: "session_before_switch", reason: "resume" }]);
    expect(s.sessionReason).toBe("switching:resume");
  });
});
