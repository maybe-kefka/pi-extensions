import { describe, expect, it } from "vitest";
import { initialState, streamReducer, textOfContent } from "../lib/stream.js";
import type { StreamAction } from "../lib/stream.js";

function run(actions: StreamAction[]) {
  return actions.reduce(streamReducer, initialState);
}

describe("消息文本累积", () => {
  it("user message_start → 直接成文", () => {
    const s = run([{ type: "message_start", message: { role: "user", content: "你好" } }]);
    expect(s.messages).toHaveLength(1);
    expect(s.messages[0].role).toBe("user");
    expect(s.messages[0].text).toBe("你好");
    expect(s.messages[0].final).toBe(true);
  });

  it("assistant 流式：text_delta 累积 → message_end 定稿", () => {
    let s = run([{ type: "message_start", message: { role: "assistant", content: [] } }]);
    expect(s.currentAssistantId).not.toBeNull();
    s = streamReducer(s, {
      type: "message_update",
      event: { type: "text_delta", delta: "你" },
    });
    s = streamReducer(s, {
      type: "message_update",
      event: { type: "text_delta", delta: "好" },
    });
    expect(s.messages[0].text).toBe("你好");
    s = streamReducer(s, { type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "你好世界" }] } });
    expect(s.messages[0].text).toBe("你好世界");
    expect(s.messages[0].final).toBe(true);
    expect(s.currentAssistantId).toBeNull();
  });

  it("thinking_delta 累积（partial 优先）", () => {
    let s = run([{ type: "message_start", message: { role: "assistant", content: [] } }]);
    s = streamReducer(s, { type: "message_update", event: { type: "thinking_delta", delta: "思" } });
    s = streamReducer(s, { type: "message_update", event: { type: "thinking_delta", delta: "考", partial: { thinking: "思考中" } } });
    expect(s.messages[0].thinking).toBe("思考中");
  });

  it("非 assistant 的 message_end 忽略", () => {
    const s = run([{ type: "message_end", message: { role: "user", content: "x" } }]);
    expect(s.currentAssistantId).toBeNull();
  });

  it("toolResult 的 message 事件忽略（避免与工具行重复）", () => {
    const s = run([{ type: "message_start", message: { role: "toolResult", content: "out", toolName: "bash" } }]);
    expect(s.messages).toHaveLength(0);
  });

  it("message_end 提取 toolCallIds（纯工具消息 text 为空但保留工具引用）", () => {
    let s = run([{ type: "message_start", message: { role: "assistant", content: [] } }]);
    s = streamReducer(s, {
      type: "message_end",
      message: {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "先想想" },
          { type: "toolCall", id: "tool:1", name: "bash", arguments: {} },
          { type: "toolCall", id: "tool:2", name: "read", arguments: {} },
        ],
      },
    });
    expect(s.messages[0].toolCallIds).toEqual(["tool:1", "tool:2"]);
    expect(s.messages[0].text).toBe("");
    expect(s.messages[0].thinking).toBe("");
  });

  it("message_start 也提取 toolCallIds（start 时 content 已有 toolCall）", () => {
    const s = run([
      { type: "message_start", message: { role: "assistant", content: [{ type: "toolCall", id: "t9", name: "x", arguments: {} }] } },
    ]);
    expect(s.messages[0].toolCallIds).toEqual(["t9"]);
  });
});

describe("工具行", () => {
  it("start → update → end 生命周期", () => {
    let s = run([
      { type: "tool_start", toolCallId: "t1", toolName: "bash", args: { command: "ls" } },
    ]);
    expect(s.tools).toHaveLength(1);
    expect(s.tools[0].final).toBe(false);
    s = streamReducer(s, {
      type: "tool_update",
      toolCallId: "t1",
      partialResult: { content: [{ type: "text", text: "a.txt" }] },
    });
    expect(s.tools[0].output).toBe("a.txt");
    s = streamReducer(s, {
      type: "tool_end",
      toolCallId: "t1",
      result: { content: [{ type: "text", text: "a.txt\nb.txt" }] },
      isError: false,
    });
    expect(s.tools[0].final).toBe(true);
    expect(s.tools[0].output).toBe("a.txt\nb.txt");
    expect(s.tools[0].isError).toBe(false);
  });

  it("tool_end 错误标记", () => {
    const s = run([
      { type: "tool_start", toolCallId: "t1", toolName: "x", args: {} },
      { type: "tool_end", toolCallId: "t1", result: null, isError: true },
    ]);
    expect(s.tools[0].isError).toBe(true);
  });
});

describe("busy / 队列", () => {
  it("agent_start → streaming；agent_end(willRetry) 保持；agent_settled 停止", () => {
    let s = run([{ type: "agent_start" }]);
    expect(s.streaming).toBe(true);
    s = streamReducer(s, { type: "agent_end", willRetry: true });
    expect(s.streaming).toBe(true);
    s = streamReducer(s, { type: "agent_end", willRetry: false });
    expect(s.streaming).toBe(false);
    s = streamReducer(s, { type: "agent_start" });
    s = streamReducer(s, { type: "agent_settled" });
    expect(s.streaming).toBe(false);
  });

  it("queue_update", () => {
    const s = run([{ type: "queue_update", steering: ["a"], followUp: ["b", "c"] }]);
    expect(s.queue).toEqual({ steering: ["a"], followUp: ["b", "c"] });
  });

  it("state 事件更新模型/上下文/streaming", () => {
    const s = run([
      {
        type: "state",
        state: {
          isStreaming: true,
          model: { provider: "anthropic", id: "m", name: "M" },
          thinkingLevel: "high",
          context: { tokens: 100, contextWindow: 200, percent: 0.5 },
          messageCount: 3,
        },
      },
    ]);
    expect(s.model?.id).toBe("m");
    expect(s.thinkingLevel).toBe("high");
    expect(s.context.percent).toBe(0.5);
    expect(s.streaming).toBe(true);
  });
});

describe("会话切换", () => {
  it("session_start 清空消息与工具", () => {
    let s = run([
      { type: "message_start", message: { role: "user", content: "hi" } },
      { type: "tool_start", toolCallId: "t1", toolName: "x", args: {} },
    ]);
    expect(s.messages.length + s.tools.length).toBe(2);
    s = streamReducer(s, { type: "session_start", reason: "resume" });
    expect(s.messages).toHaveLength(0);
    expect(s.tools).toHaveLength(0);
    expect(s.sessionReason).toBe("resume");
  });

  it("history 回填（只保留 user/assistant）", () => {
    const s = run([
      {
        type: "history",
        messages: [
          { role: "user", text: "hi" },
          { role: "assistant", text: "yo" },
          { role: "toolResult", text: "out" },
        ],
      },
    ]);
    expect(s.messages).toHaveLength(2);
    expect(s.messages[0].text).toBe("hi");
    expect(s.messages[1].text).toBe("yo");
  });
});

describe("桥接面板", () => {
  it("notify 保留最近 6 条", () => {
    let s = initialState;
    for (let i = 0; i < 8; i++) s = streamReducer(s, { type: "notify", message: `n${i}`, notifyType: "info" });
    expect(s.bridge.notifies).toHaveLength(6);
    expect(s.bridge.notifies[0].message).toBe("n7");
  });

  it("setStatus 设置/清除", () => {
    let s = run([{ type: "setStatus", statusKey: "k", statusText: "v" }]);
    expect(s.bridge.status.k).toBe("v");
    s = streamReducer(s, { type: "setStatus", statusKey: "k", statusText: null });
    expect(s.bridge.status.k).toBeUndefined();
  });

  it("setWidget 空行清除", () => {
    let s = run([{ type: "setWidget", widgetKey: "w", widgetLines: ["a", "b"] }]);
    expect(s.bridge.widget?.lines).toEqual(["a", "b"]);
    s = streamReducer(s, { type: "setWidget", widgetKey: "w", widgetLines: null });
    expect(s.bridge.widget).toBeNull();
  });
});

describe("conn / 其它", () => {
  it("conn 状态", () => {
    expect(run([{ type: "conn", state: "open" }]).conn).toBe("open");
  });

  it("toggle_thinking", () => {
    let s = run([{ type: "message_start", message: { role: "assistant", content: [] } }]);
    const id = s.messages[0].id;
    s = streamReducer(s, { type: "toggle_thinking", id });
    expect(s.messages[0].thinkingExpanded).toBe(true);
  });

  it("未知 action 不崩溃", () => {
    expect(streamReducer(initialState, { type: "bogus" } as never)).toBe(initialState);
  });
});

describe("textOfContent", () => {
  it("字符串 / 文本块数组 / 其它", () => {
    expect(textOfContent("str")).toBe("str");
    expect(textOfContent([{ type: "text", text: "a" }, { type: "text", text: "b" }])).toBe("a\nb");
    expect(textOfContent(null)).toBe("");
    expect(textOfContent([{ type: "image" }])).toBe("");
  });
});
