/**
 * WebSocket JSON-RPC 2.0 形态协议（纯函数）。
 * SPEC §4.1。
 */

export const JSONRPC = "2.0";

export interface RpcError {
  code: number;
  message: string;
}

export interface RpcResponse {
  jsonrpc: string;
  id: string | number | null;
  result?: unknown;
  error?: RpcError;
}

export interface RpcNotification {
  jsonrpc: string;
  method: string;
  params: unknown;
}

export type IncomingMessage =
  | { kind: "request"; id: string | number; method: string; params: Record<string, unknown> }
  | { kind: "notification"; method: string; params: Record<string, unknown> }
  | { kind: "invalid"; code: number; message: string };

export const RPC_ERROR = {
  parse: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
} as const;

export function parseMessage(raw: string): IncomingMessage {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { kind: "invalid", code: RPC_ERROR.parse, message: "JSON 解析失败" };
  }

  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return { kind: "invalid", code: RPC_ERROR.invalidRequest, message: "请求必须是 JSON 对象" };
  }

  const obj = data as Record<string, unknown>;
  if (obj.jsonrpc !== JSONRPC) {
    return { kind: "invalid", code: RPC_ERROR.invalidRequest, message: `jsonrpc 字段必须为 "${JSONRPC}"` };
  }
  if (typeof obj.method !== "string" || obj.method.length === 0) {
    return { kind: "invalid", code: RPC_ERROR.invalidRequest, message: "缺少 method" };
  }

  const method = obj.method;
  const params =
    typeof obj.params === "object" && obj.params !== null && !Array.isArray(obj.params)
      ? (obj.params as Record<string, unknown>)
      : {};

  if (obj.id === undefined) {
    return { kind: "notification", method, params };
  }
  if (typeof obj.id !== "string" && typeof obj.id !== "number") {
    return { kind: "invalid", code: RPC_ERROR.invalidRequest, message: "id 必须是 string 或 number" };
  }
  return { kind: "request", id: obj.id, method, params };
}

export function makeResponse(id: string | number | null, result: unknown = null): RpcResponse {
  return { jsonrpc: JSONRPC, id, result };
}

export function makeError(id: string | number | null, code: number, message: string): RpcResponse {
  return { jsonrpc: JSONRPC, id, error: { code, message } };
}

export function makeEvent(type: string, fields: Record<string, unknown>): RpcNotification {
  return { jsonrpc: JSONRPC, method: "pi:event", params: { type, ...fields } };
}

export function isEventMessage(msg: { method: string }): boolean {
  return msg.method === "pi:event";
}

/**
 * 序列化 RPC 响应/事件。JSON.stringify 对超深对象抛 RangeError（递归爆栈）、
 * 对循环引用抛 TypeError——此类异常发生在 async 上下文会以 uncaughtException
 * 杀死整个 pi 进程（R27 会话树事故）。任何失败都降级为错误 JSON，绝不外抛。
 */
export function serialize(msg: unknown): string {
  try {
    return JSON.stringify(msg);
  } catch {
    return JSON.stringify({ jsonrpc: JSONRPC, error: { code: 1, message: "响应序列化失败（对象过深或含循环引用）" } });
  }
}
