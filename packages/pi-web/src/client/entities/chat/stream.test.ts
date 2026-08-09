import { describe, expect, it } from "vitest";
import {
  bubbleActiveThinking,
  bubbleStreaming,
  bubbleThinking,
  bubbleToolCallIds,
  initialState,
  streamReducer,
  textOfContent,
  thinkingOfContent,
  thinkingSeconds,
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
        { text: "a", thinking: "想1", toolCallIds: ["t1"], steps: [], final: true },
        { text: "b", thinking: "想2", toolCallIds: ["t2", "t1"], steps: [], final: false },
      ],
    };
    expect(bubbleStreaming(b)).toBe(true);
    expect(bubbleThinking(b)).toBe("想1\n\n想2");
    expect(bubbleToolCallIds(b)).toEqual(["t1", "t2"]);
  });

  it("thinkingSeconds：时间戳差取秒，缺时间戳返回 null", () => {
    expect(thinkingSeconds({ startedAt: 1000, endedAt: 4500 })).toBe(3);
    expect(thinkingSeconds({ startedAt: 1000, endedAt: 1000 })).toBe(0);
    expect(thinkingSeconds({ startedAt: 1000 })).toBeNull();
    expect(thinkingSeconds({ endedAt: 4500 })).toBeNull();
    expect(thinkingSeconds({})).toBeNull();
    // 流式中无 endedAt
    expect(thinkingSeconds({ startedAt: 5000 })).toBeNull();
  });

  it("bubbleActiveThinking：最后一个活跃（非 final）turn 的 thinking", () => {
    const b = {
      id: "b1",
      userIndex: 0,
      userText: "q",
      userFinal: true,
      turns: [
        { text: "a", thinking: "想1", toolCallIds: [], steps: [], final: true },
        { text: "b", thinking: "想2", toolCallIds: [], steps: [], final: false },
      ],
    };
    expect(bubbleActiveThinking(b)).toBe("想2");
    // 全部 final → null
    const done = { ...b, turns: b.turns.map((t) => ({ ...t, final: true })) };
    expect(bubbleActiveThinking(done)).toBeNull();
    // 无 thinking 的活跃 turn → 空串
    const noThink = {
      ...b,
      turns: [{ text: "b", thinking: "", toolCallIds: [], steps: [], final: false }],
    };
    expect(bubbleActiveThinking(noThink)).toBe("");
    // 空 turns
    expect(bubbleActiveThinking({ id: "x", userIndex: -1, userText: "", userFinal: true, turns: [] })).toBeNull();
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

describe("R18：Turn.steps 块序列", () => {
  it("message_end 从 content 块序列重建 steps（text/thinking/toolCall 按序）", () => {
    const state = reduce([
      { type: "message_start", message: { role: "user", content: "q" } },
      { type: "message_start", message: { role: "assistant", content: [] } },
      {
        type: "message_end",
        message: {
          role: "assistant",
          content: [
            { type: "text", text: "我先读取文件" },
            { type: "thinking", thinking: "计划一下" },
            { type: "toolCall", id: "t1", name: "bash", arguments: {} },
            { type: "text", text: "完成" },
          ],
        },
      },
    ]);
    const turn = state.bubbles[0].turns[0];
    expect(turn.steps).toEqual([
      { type: "text", text: "我先读取文件" },
      { type: "thinking", text: "计划一下" },
      { type: "tool", toolCallId: "t1" },
      { type: "text", text: "完成" },
    ]);
    // turn.text = 最后 text 块（最终回复），不含过程 content
    expect(turn.text).toBe("完成");
    expect(turn.thinking).toBe("计划一下");
    expect(turn.toolCallIds).toEqual(["t1"]);
  });

  it("纯文本 content → 单 text step；turn.text 不变", () => {
    const state = reduce([
      { type: "message_start", message: { role: "user", content: "q" } },
      { type: "message_start", message: { role: "assistant", content: [] } },
      { type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "你好" }] } },
    ]);
    expect(state.bubbles[0].turns[0].steps).toEqual([{ type: "text", text: "你好" }]);
    expect(state.bubbles[0].turns[0].text).toBe("你好");
  });

  it("纯 toolCall turn → steps 仅 tool；text 为空", () => {
    const state = reduce([
      { type: "message_start", message: { role: "user", content: "q" } },
      { type: "message_start", message: { role: "assistant", content: [{ type: "toolCall", id: "t1", name: "bash", arguments: {} }] } },
      { type: "message_end", message: { role: "assistant", content: [{ type: "toolCall", id: "t1", name: "bash", arguments: {} }] } },
    ]);
    const turn = state.bubbles[0].turns[0];
    expect(turn.steps).toEqual([{ type: "tool", toolCallId: "t1" }]);
    expect(turn.text).toBe("");
  });

  it("流式中 steps 按 contentIndex 增量累积（thinking/text 块）", () => {
    const state = reduce([
      { type: "message_start", message: { role: "user", content: "q" } },
      {
        type: "message_start",
        message: {
          role: "assistant",
          content: [
            { type: "thinking", thinking: "" },
            { type: "text", text: "" },
          ],
        },
      },
      { type: "message_update", event: { type: "thinking_delta", contentIndex: 0, partial: { thinking: "想" } } },
      { type: "message_update", event: { type: "thinking_delta", contentIndex: 0, partial: { thinking: "想想" } } },
      { type: "message_update", event: { type: "text_delta", contentIndex: 1, delta: "你" } },
      { type: "message_update", event: { type: "text_delta", contentIndex: 1, delta: "好" } },
    ]);
    const turn = state.bubbles[0].turns[0];
    expect(turn.steps).toEqual([
      { type: "thinking", text: "想想" },
      { type: "text", text: "你好" },
    ]);
    // turn.text 同步为最后 text 块累积
    expect(turn.text).toBe("你好");
  });

  it("history 回填合成 steps（text/thinking/toolCalls）", () => {
    const state = reduce([
      {
        type: "history",
        messages: [
          { role: "user", text: "q", userIndex: 0 },
          { role: "assistant", text: "答", thinking: "想", toolCalls: [{ id: "t1", name: "bash", arguments: {} }] },
        ],
      },
    ]);
    expect(state.bubbles[0].turns[0].steps).toEqual([
      { type: "text", text: "答" },
      { type: "thinking", text: "想" },
      { type: "tool", toolCallId: "t1" },
    ]);
  });

  it("流式 message_start 时 steps 从 content 初始化（含 toolCall 块）", () => {
    const state = reduce([
      { type: "message_start", message: { role: "user", content: "q" } },
      {
        type: "message_start",
        message: {
          role: "assistant",
          content: [
            { type: "thinking", thinking: "想" },
            { type: "toolCall", id: "t1", name: "bash", arguments: {} },
          ],
        },
      },
    ]);
    expect(state.bubbles[0].turns[0].steps).toEqual([
      { type: "thinking", text: "想" },
      { type: "tool", toolCallId: "t1" },
    ]);
  });
});

describe("R18.1b：start 事件建块（真实流式 message_start content 为空）", () => {
  it("thinking_start/text_start 按 contentIndex 建块，delta 累积", () => {
    const state = reduce([
      { type: "message_start", message: { role: "user", content: "q" } },
      { type: "message_start", message: { role: "assistant", content: [] } },
      { type: "message_update", event: { type: "thinking_start", contentIndex: 0 } },
      { type: "message_update", event: { type: "thinking_delta", contentIndex: 0, delta: "想", partial: { thinking: "想" } } },
      { type: "message_update", event: { type: "thinking_delta", contentIndex: 0, delta: "想", partial: { thinking: "想想" } } },
      { type: "message_update", event: { type: "text_start", contentIndex: 1 } },
      { type: "message_update", event: { type: "text_delta", contentIndex: 1, delta: "你" } },
      { type: "message_update", event: { type: "text_delta", contentIndex: 1, delta: "好" } },
    ]);
    const turn = state.bubbles[0].turns[0];
    expect(turn.steps).toEqual([
      { type: "thinking", text: "想想" },
      { type: "text", text: "你好" },
    ]);
    expect(turn.text).toBe("你好");
  });

  it("toolcall_start 建 tool 块，tool_execution_start 按序填充 toolCallId", () => {
    const state = reduce([
      { type: "message_start", message: { role: "user", content: "q" } },
      { type: "message_start", message: { role: "assistant", content: [] } },
      { type: "message_update", event: { type: "thinking_start", contentIndex: 0 } },
      { type: "message_update", event: { type: "toolcall_start", contentIndex: 1 } },
      { type: "tool_start", toolCallId: "t1", toolName: "bash", args: { command: "ls" } },
      { type: "tool_update", toolCallId: "t1", partialResult: { content: [{ type: "text", text: "out" }] } },
    ]);
    const turn = state.bubbles[0].turns[0];
    expect(turn.steps).toEqual([
      { type: "thinking", text: "" },
      { type: "tool", toolCallId: "t1" },
    ]);
    // 全局 tools 表正常
    expect(state.tools[0]).toMatchObject({ toolCallId: "t1", toolName: "bash", output: "out" });
  });

  it("越界防御：contentIndex 跳跃时补齐占位块", () => {
    const state = reduce([
      { type: "message_start", message: { role: "user", content: "q" } },
      { type: "message_start", message: { role: "assistant", content: [] } },
      { type: "message_update", event: { type: "text_start", contentIndex: 2 } },
      { type: "message_update", event: { type: "text_delta", contentIndex: 2, delta: "x" } },
    ]);
    const turn = state.bubbles[0].turns[0];
    expect(turn.steps).toHaveLength(3);
    expect(turn.steps[2]).toEqual({ type: "text", text: "x" });
  });
});

describe("R20：真实事件序（message_end 先于 tool_execution_start）", () => {
  const toolTurnActions: StreamAction[] = [
    { type: "message_start", message: { role: "user", content: "q" } },
    { type: "message_start", message: { role: "assistant", content: [] } },
    { type: "message_update", event: { type: "toolcall_start", contentIndex: 0 } },
    // 实测顺序：message_end 在 tool_execution_start 之前到达
    { type: "message_end", message: { role: "assistant", content: [{ type: "toolCall", id: "t1", name: "bash", arguments: { command: "ls" } }] } },
    { type: "tool_start", toolCallId: "t1", toolName: "bash", args: { command: "ls" } },
  ];

  it("message_end(tool 轮) 不 final，tool_start 仍填充块 id，turn_end 才 final", () => {
    const state = reduce(toolTurnActions);
    const turn = state.bubbles[0].turns[0];
    expect(turn.final).toBe(false);
    // tool 块 id 已被 tool_start 填充（即使 message_end 已过）
    expect(turn.steps).toEqual([{ type: "tool", toolCallId: "t1" }]);
    expect(state.tools[0]).toMatchObject({ toolCallId: "t1", toolName: "bash" });
    // turn_end 才 final
    const after = reduce([{ type: "turn_end" }], state);
    expect(after.bubbles[0].turns[0].final).toBe(true);
  });

  it("agent_end 兜底 final 化非 final turn（中断场景无 turn_end）", () => {
    const state = reduce(toolTurnActions);
    expect(state.bubbles[0].turns[0].final).toBe(false);
    const after = reduce([{ type: "agent_end", willRetry: false }], state);
    expect(after.bubbles[0].turns[0].final).toBe(true);
    const afterSettled = reduce([{ type: "agent_settled" }], state);
    expect(afterSettled.bubbles[0].turns[0].final).toBe(true);
  });

  it("防御：tool_start 无空 tool 块时在 steps 末尾追加（execution 先到）", () => {
    const state = reduce([
      { type: "message_start", message: { role: "user", content: "q" } },
      { type: "message_start", message: { role: "assistant", content: [] } },
      { type: "tool_start", toolCallId: "t1", toolName: "bash", args: { command: "ls" } },
    ]);
    const turn = state.bubbles[0].turns[0];
    expect(turn.steps).toEqual([{ type: "tool", toolCallId: "t1" }]);
  });

  it("纯文本轮 message_end 仍立即 final（无 tool 时保持 R18 行为）", () => {
    const state = reduce([
      { type: "message_start", message: { role: "user", content: "q" } },
      { type: "message_start", message: { role: "assistant", content: [] } },
      { type: "message_update", event: { type: "text_delta", contentIndex: 0, delta: "答" } },
      { type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "答案" }] } },
    ]);
    const turn = state.bubbles[0].turns[0];
    expect(turn.final).toBe(true);
    expect(turn.text).toBe("答案");
  });
});

describe("R20：compact 状态", () => {
  it("session_before_compact → compacting.phase = before（reason/willRetry 保留）", () => {
    const state = reduce([
      { type: "session_before_compact", reason: "threshold", willRetry: true },
    ]);
    expect(state.compacting).toEqual({ phase: "before", reason: "threshold", willRetry: true });
  });

  it("session_compact → phase = done（reason 保留）", () => {
    const state = reduce([
      { type: "session_before_compact", reason: "manual", willRetry: false },
      { type: "session_compact", reason: "manual", willRetry: false, fromExtension: false },
    ]);
    expect(state.compacting).toEqual({ phase: "done", reason: "manual", willRetry: false });
  });

  it("session_start 重置 compacting", () => {
    const state = reduce([
      { type: "session_before_compact", reason: "overflow", willRetry: true },
      { type: "session_start", reason: "new" },
    ]);
    expect(state.compacting).toBeNull();
  });
});

describe("turn_start 气泡时机（R22）", () => {
  it("turn_start 创建空 turn（气泡立即出现）", () => {
    const s = reduce([
      { type: "message_start", message: { role: "user", content: "q" } },
      { type: "turn_start" },
    ]);
    const b = s.bubbles[0];
    expect(b.turns.length).toBe(1);
    expect(b.turns[0].final).toBe(false);
    expect(b.turns[0].steps).toEqual([]);
  });

  it("message_start:assistant 复用 turn_start 的空 turn（不重复）", () => {
    const s = reduce([
      { type: "message_start", message: { role: "user", content: "q" } },
      { type: "turn_start" },
      { type: "message_start", message: { role: "assistant", content: [{ type: "text", text: "" }] } },
    ]);
    const b = s.bubbles[0];
    expect(b.turns.length).toBe(1);
    expect(b.turns[0].text).toBe("");
  });

  it("message_start:assistant 无空 turn 时正常新建", () => {
    const s = reduce([
      { type: "message_start", message: { role: "user", content: "q" } },
      { type: "message_start", message: { role: "assistant", content: [{ type: "text", text: "hi" }] } },
    ]);
    const b = s.bubbles[0];
    expect(b.turns.length).toBe(1);
    expect(b.turns[0].text).toBe("hi");
  });
});

describe("R23 修复：turn_start 不污染已完成气泡", () => {
  it("新消息 turn_start 先到时：旧气泡 turns 不变，创建占位气泡，message_start:user 接管", () => {
    // 消息1 完成（agent 1）
    const s1 = reduce([
      { type: "agent_start" },
      { type: "turn_start" },
      { type: "message_start", message: { role: "user", content: "q1" } },
      { type: "message_start", message: { role: "assistant", content: [{ type: "text", text: "回复1" }] } },
      { type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "回复1" }] } },
      { type: "turn_end" },
    ]);
    expect(s1.bubbles).toHaveLength(1);
    expect(s1.bubbles[0].turns).toHaveLength(1);
    expect(s1.bubbles[0].turns[0].text).toBe("回复1");
    // 消息2 开始：agent_start + turn_start 先到
    // 消息2 开始：agent_start + turn_start 先到（从 s1 继续）
    const s2 = streamReducer(streamReducer(s1, { type: "agent_start" }), { type: "turn_start" });
    // 旧气泡不被污染（仍是 1 turn）
    expect(s2.bubbles[0].turns).toHaveLength(1);
    // 占位气泡创建（userIndex -1）
    expect(s2.bubbles).toHaveLength(2);
    expect(s2.bubbles[1].userIndex).toBe(-1);
    // message_start:user 接管占位（不新建）
    const s3 = streamReducer(s2, { type: "message_start", message: { role: "user", content: "q2" } });
    expect(s3.bubbles).toHaveLength(2);
    expect(s3.bubbles[1].userText).toBe("q2");
    expect(s3.bubbles[1].userIndex).toBe(1);
    expect(s3.bubbles[1].turns).toHaveLength(1); // turn_start 的空 turn 保留
    expect(s3.bubbles[0].turns).toHaveLength(1); // 旧气泡仍 1 turn（回复不丢）
  });

  it("同一 agent 多轮：turn_start 追加到同一气泡（不建占位）", () => {
    const s = reduce([
      { type: "agent_start" },
      { type: "turn_start" },
      { type: "message_start", message: { role: "user", content: "q" } },
      { type: "message_start", message: { role: "assistant", content: [{ type: "text", text: "第一轮" }] } },
      { type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "第一轮" }] } },
      { type: "turn_end" },
      // 同 agent 第二轮（无 agent_start 间隔）
      { type: "turn_start" },
    ]);
    expect(s.bubbles).toHaveLength(1);
    expect(s.bubbles[0].turns).toHaveLength(2);
  });

  it("agent_start 递增 agentId（跨 agent 判定依据）", () => {
    const s1 = streamReducer(initialState, { type: "agent_start" });
    expect(s1.agentId).toBe(1);
    const s2 = streamReducer(s1, { type: "agent_start" });
    expect(s2.agentId).toBe(2);
  });
});
