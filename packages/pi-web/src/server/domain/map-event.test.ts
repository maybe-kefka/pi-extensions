import { describe, expect, it } from "vitest";
import { mapEvent, requiresStateRefresh } from "./map-event.js";

describe("mapEvent — 消息流", () => {
  it("message_start / message_end 透传整份 message", () => {
    const msg = { role: "user", content: "hi" };
    expect(mapEvent("message_start", { message: msg })).toEqual({ fields: { message: msg }, refreshState: false });
    expect(mapEvent("message_end", { message: msg }).refreshState).toBe(true);
  });

  it("message_update 只透传 assistantMessageEvent，不携带整份 message", () => {
    const evt = { type: "text_delta", delta: "你", partial: { role: "assistant", content: [{ type: "text", text: "你" }] } };
    const m = mapEvent("message_update", { message: { role: "assistant", content: [] }, assistantMessageEvent: evt });
    expect(m.fields).toEqual({ event: evt });
    expect(m.fields && "message" in m.fields).toBe(false);
  });

  it("消息事件缺 message → null", () => {
    expect(mapEvent("message_start", {}).fields).toEqual({ message: null });
  });
});

describe("mapEvent — 工具执行", () => {
  it("tool_execution_start / update / end 裁剪字段", () => {
    expect(mapEvent("tool_execution_start", { toolCallId: "a", toolName: "bash", args: { command: "ls" } }).fields).toEqual({
      toolCallId: "a",
      toolName: "bash",
      args: { command: "ls" },
    });
    expect(
      mapEvent("tool_execution_update", { toolCallId: "a", toolName: "bash", partialResult: { content: [] } }).fields,
    ).toEqual({ toolCallId: "a", toolName: "bash", partialResult: { content: [] } });
    expect(
      mapEvent("tool_execution_end", { toolCallId: "a", toolName: "bash", result: { content: [] }, isError: false }).fields,
    ).toEqual({ toolCallId: "a", toolName: "bash", result: { content: [] }, isError: false });
  });
});

describe("mapEvent — 状态事件", () => {
  it("agent_* 触发 state 刷新", () => {
    expect(mapEvent("agent_start", {}).refreshState).toBe(true);
    expect(mapEvent("agent_end", { willRetry: true }).fields).toEqual({ willRetry: true });
    expect(mapEvent("agent_settled", {}).refreshState).toBe(true);
  });

  it("session 事件字段", () => {
    expect(mapEvent("session_before_switch", { reason: "resume", targetSessionFile: "/x.jsonl" }).fields).toEqual({
      reason: "resume",
      targetSessionFile: "/x.jsonl",
    });
    expect(mapEvent("session_start", { reason: "new", previousSessionFile: "/old.jsonl" }).refreshState).toBe(true);
    expect(mapEvent("session_info_changed", { name: "foo" }).fields).toEqual({ name: "foo" });
    expect(mapEvent("model_select", { model: { id: "m" }, previousModel: null, source: "set" }).fields).toEqual({
      model: { id: "m" },
      previousModel: null,
      source: "set",
    });
    expect(mapEvent("thinking_level_select", { level: "high", previousLevel: "medium" }).fields).toEqual({
      level: "high",
      previousLevel: "medium",
    });
  });

  it("queue_update", () => {
    expect(mapEvent("queue_update", { steering: ["a"], followUp: ["b"] }).fields).toEqual({ steering: ["a"], followUp: ["b"] });
    expect(mapEvent("queue_update", {}).fields).toEqual({ steering: [], followUp: [] });
  });
});

describe("mapEvent — ctx.ui 桥接", () => {
  it("notify / setStatus / setWidget", () => {
    expect(mapEvent("notify", { message: "hi", notifyType: "warning" }).fields).toEqual({
      message: "hi",
      notifyType: "warning",
    });
    expect(mapEvent("setStatus", { statusKey: "k", statusText: "v" }).fields).toEqual({ statusKey: "k", statusText: "v" });
    expect(mapEvent("setWidget", { widgetKey: "k", widgetLines: ["a"], widgetPlacement: "belowEditor" }).fields).toEqual({
      widgetKey: "k",
      widgetLines: ["a"],
      widgetPlacement: "belowEditor",
    });
  });

  it("setWidget 非数组 widgetLines → null", () => {
    expect(mapEvent("setWidget", { widgetKey: "k", widgetLines: "oops" }).fields).toEqual({
      widgetKey: "k",
      widgetLines: null,
      widgetPlacement: "aboveEditor",
    });
  });
});

describe("mapEvent — 边界", () => {
  it("未知事件 → 丢弃", () => {
    expect(mapEvent("unknown_event", { any: 1 })).toEqual({ fields: null, refreshState: false });
  });

  it("非对象 payload 不崩溃", () => {
    expect(mapEvent("message_start", null).fields).toEqual({ message: null });
    expect(mapEvent("agent_start", "oops").fields).toEqual({});
  });
});

describe("requiresStateRefresh", () => {
  it("白名单判定", () => {
    expect(requiresStateRefresh("session_start")).toBe(true);
    expect(requiresStateRefresh("message_end")).toBe(true);
    expect(requiresStateRefresh("agent_settled")).toBe(true);
    expect(requiresStateRefresh("message_start")).toBe(false);
    expect(requiresStateRefresh("tool_execution_start")).toBe(false);
    expect(requiresStateRefresh("nope")).toBe(false);
  });
});

describe("mapEvent — 轮次边界", () => {
  it("turn_start 透传 turnIndex/timestamp", () => {
    expect(mapEvent("turn_start", { turnIndex: 1, timestamp: 123 }).fields).toEqual({
      turnIndex: 1,
      timestamp: 123,
    });
    expect(mapEvent("turn_start", {}).fields).toEqual({ turnIndex: null, timestamp: null });
  });

  it("turn_end 透传 turnIndex/message/toolResults（缺省空数组）", () => {
    const msg = { role: "assistant", content: [] };
    expect(mapEvent("turn_end", { turnIndex: 2, message: msg, toolResults: [{ toolCallId: "a" }] }).fields).toEqual({
      turnIndex: 2,
      message: msg,
      toolResults: [{ toolCallId: "a" }],
    });
    expect(mapEvent("turn_end", { turnIndex: 2, message: msg }).fields).toEqual({
      turnIndex: 2,
      message: msg,
      toolResults: [],
    });
  });

  it("turn 事件不触发 state 刷新", () => {
    expect(mapEvent("turn_start", {}).refreshState).toBe(false);
    expect(mapEvent("turn_end", {}).refreshState).toBe(false);
  });
});

describe("注册进程表事件透传", () => {
  it("agent_list / agent_closed 透传全量 payload（chat tab 生命周期依赖）", () => {
    const list = mapEvent("agent_list", { agents: [{ processId: "p-1", sessionFile: "/s/1.jsonl" }] });
    expect(list.fields?.agents).toHaveLength(1);
    const closed = mapEvent("agent_closed", { processId: "p-1" });
    expect(closed.fields?.processId).toBe("p-1");
  });
});

describe("usage_update 透传", () => {
  it("usage_update 全量透传（水杯数据——不得被 mapEvent 丢弃）", () => {
    const u = mapEvent("usage_update", { percent: 0.42, tokens: 1000, contextWindow: 8000, categories: [] });
    expect(u.fields?.percent).toBe(0.42);
    expect(u.fields?.categories).toEqual([]);
  });
});
