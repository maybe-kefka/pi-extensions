/** WS 客户端：连接/重连/JSON-RPC 请求/事件订阅。 */

export type ConnState = "connecting" | "open" | "closed";

export type EventHandler = (event: { type: string; [k: string]: unknown }) => void;

export interface RpcClient {
  readonly connState: ConnState;
  connect(): void;
  disconnect(): void;
  request<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T>;
  onEvent(handler: EventHandler): () => void;
}

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 10_000;

export function createRpcClient(opts: {
  url: string;
  onConnState?: (state: ConnState) => void;
  onEvent?: EventHandler;
}): RpcClient {
  let ws: WebSocket | null = null;
  let state: ConnState = "closed";
  let nextId = 1;
  let reconnectDelay = RECONNECT_BASE_MS;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  const pending = new Map<string | number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  const eventHandlers = new Set<EventHandler>();
  if (opts.onEvent) eventHandlers.add(opts.onEvent);

  function setState(next: ConnState) {
    if (state === next) return;
    state = next;
    opts.onConnState?.(next);
  }

  function emitEvent(event: { type: string; [k: string]: unknown }) {
    for (const h of eventHandlers) {
      try {
        h(event);
      } catch {
        /* 单个 handler 异常不影响其它 */
      }
    }
  }

  function scheduleReconnect() {
    if (disposed || reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
  }

  function connect() {
    if (disposed) return;
    setState("connecting");
    try {
      ws = new WebSocket(opts.url);
    } catch {
      setState("closed");
      scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      reconnectDelay = RECONNECT_BASE_MS;
      setState("open");
    };

    ws.onmessage = (evt) => {
      let msg: { method?: string; params?: unknown; id?: string | number; result?: unknown; error?: { message?: string } };
      try {
        msg = JSON.parse(String(evt.data));
      } catch {
        return;
      }
      if (msg.method === "pi:event" && msg.params && typeof msg.params === "object") {
        emitEvent(msg.params as { type: string; [k: string]: unknown });
        return;
      }
      if (msg.id !== undefined && pending.has(msg.id)) {
        const p = pending.get(msg.id)!;
        pending.delete(msg.id);
        if (msg.error) p.reject(new Error(msg.error.message || "RPC error"));
        else p.resolve(msg.result);
      }
    };

    ws.onclose = () => {
      ws = null;
      setState("closed");
      for (const [, p] of pending) p.reject(new Error("连接断开"));
      pending.clear();
      scheduleReconnect();
    };

    ws.onerror = () => {
      ws?.close();
    };
  }

  function request<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        reject(new Error("未连接"));
        return;
      }
      const id = nextId++;
      pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      ws.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
    });
  }

  function disconnect() {
    disposed = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    ws?.close();
    ws = null;
    setState("closed");
  }

  return {
    get connState() {
      return state;
    },
    connect,
    disconnect,
    request,
    onEvent(handler: EventHandler) {
      eventHandlers.add(handler);
      return () => eventHandlers.delete(handler);
    },
  };
}
