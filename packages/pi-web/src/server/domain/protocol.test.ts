import { describe, expect, it } from "vitest";
import {
  isEventMessage,
  makeError,
  makeEvent,
  makeResponse,
  parseMessage,
  serialize,
} from "./protocol.js";

describe("parseMessage", () => {
  it("合法请求", () => {
    expect(parseMessage('{"jsonrpc":"2.0","id":1,"method":"pi:getState","params":{}}')).toEqual({
      kind: "request",
      id: 1,
      method: "pi:getState",
      params: {},
    });
  });

  it("id 支持字符串与数字", () => {
    expect(parseMessage('{"jsonrpc":"2.0","id":"req-1","method":"m"}').kind).toBe("request");
  });

  it("缺 params → {}；params 非对象 → {}", () => {
    expect(parseMessage('{"jsonrpc":"2.0","id":1,"method":"m"}')).toMatchObject({ params: {} });
    expect(parseMessage('{"jsonrpc":"2.0","id":1,"method":"m","params":42}')).toMatchObject({ params: {} });
  });

  it("无 id → notification（不回复）", () => {
    expect(parseMessage('{"jsonrpc":"2.0","method":"ping","params":{}}')).toEqual({
      kind: "notification",
      method: "ping",
      params: {},
    });
  });

  it("非法 JSON → parse error", () => {
    expect(parseMessage("not json")).toEqual({ kind: "invalid", code: -32700, message: expect.any(String) });
  });

  it("非对象 / 数组 / 空 → invalid request", () => {
    expect(parseMessage("null")).toMatchObject({ kind: "invalid", code: -32600 });
    expect(parseMessage("[1,2]")).toMatchObject({ kind: "invalid", code: -32600 });
    expect(parseMessage('"str"')).toMatchObject({ kind: "invalid", code: -32600 });
  });

  it("jsonrpc 版本不符 → invalid request", () => {
    expect(parseMessage('{"jsonrpc":"1.0","id":1,"method":"m"}')).toMatchObject({ kind: "invalid", code: -32600 });
  });

  it("缺 method → invalid request", () => {
    expect(parseMessage('{"jsonrpc":"2.0","id":1}')).toMatchObject({ kind: "invalid", code: -32600 });
  });

  it("非法 id 类型 → invalid request", () => {
    expect(parseMessage('{"jsonrpc":"2.0","id":true,"method":"m"}')).toMatchObject({ kind: "invalid", code: -32600 });
    expect(parseMessage('{"jsonrpc":"2.0","id":{},"method":"m"}')).toMatchObject({ kind: "invalid", code: -32600 });
  });
});

describe("响应/事件构造", () => {
  it("makeResponse 默认 result: null", () => {
    expect(makeResponse(1)).toEqual({ jsonrpc: "2.0", id: 1, result: null });
    expect(makeResponse("a", { ok: true })).toEqual({ jsonrpc: "2.0", id: "a", result: { ok: true } });
  });

  it("makeError 形状", () => {
    expect(makeError(1, -32602, "参数错误")).toEqual({
      jsonrpc: "2.0",
      id: 1,
      error: { code: -32602, message: "参数错误" },
    });
  });

  it("makeEvent 带 type 字段", () => {
    expect(makeEvent("message_start", { message: 1 })).toEqual({
      jsonrpc: "2.0",
      method: "pi:event",
      params: { type: "message_start", message: 1 },
    });
  });

  it("isEventMessage 判定", () => {
    expect(isEventMessage({ method: "pi:event" })).toBe(true);
    expect(isEventMessage({ method: "pi:getState" })).toBe(false);
  });

  it("serialize 往返", () => {
    expect(JSON.parse(serialize(makeResponse(1)))).toEqual(makeResponse(1));
  });

  // 注：JSON.stringify 的递归爆栈（RangeError）在 bun 实测存在（200k 层即爆）、
  // 在 node/vitest 不爆（V8 内部迭代处理）——同一 try/catch 路径由下方循环引用测试覆盖。
  it("serialize 循环引用不抛（兜底错误 JSON）", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const parsed = JSON.parse(serialize(cyclic));
    expect(parsed.error?.code).toBe(1);
  });

  it("serialize 兜底保留请求 id（客户端可显示错误而非超时）", () => {
    const cyclic: Record<string, unknown> = { id: "req-42" };
    cyclic.self = cyclic;
    const parsed = JSON.parse(serialize(cyclic));
    expect(parsed.id).toBe("req-42");
    expect(parsed.error?.code).toBe(1);
  });
});
