/**
 * HTTP + WebSocket 服务器（薄层）。
 * SPEC §4 / §5 / §7：127.0.0.1 绑定、token 校验、静态文件、JSON-RPC 派发。
 */

import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { WebSocketServer, type WebSocket } from "ws";
import { extractToken, mimeTypeFor, safeResolveWebPath, tokenEquals } from "./http-util.js";
import { makeError, parseMessage, RPC_ERROR, serialize, type RpcResponse } from "./protocol.js";

export class WebServerError extends Error {
  constructor(
    public readonly code: number,
    message: string,
  ) {
    super(message);
  }
}

export interface WebServerHandle {
  port: number;
  url: string;
  clientCount: number;
  broadcast(message: string): void;
  stop(): Promise<void>;
}

export interface WebServerOptions {
  /** 0 = 随机空闲端口 */
  port: number;
  token: string;
  webDir: string;
  /** 已登录会话的操作回调；throw WebServerError 转为 JSON-RPC error */
  handleRequest: (id: string | number, method: string, params: Record<string, unknown>) => Promise<unknown>;
  maxClients?: number;
  onClientChange?: (count: number) => void;
}

const DEFAULT_MAX_CLIENTS = 16;

export async function startWebServer(options: WebServerOptions): Promise<WebServerHandle> {
  const maxClients = options.maxClients ?? DEFAULT_MAX_CLIENTS;
  const token = options.token;

  const wss = new WebSocketServer({ noServer: true });

  const server: Server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    try {
      if (!isAuthorized(req)) {
        res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("forbidden: missing/invalid token");
        return;
      }
      await serveStatic(req, res);
    } catch {
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      }
      res.end("internal error");
    }
  });

  server.on("upgrade", (req, socket, head) => {
    if (!isAuthorized(req)) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  function isAuthorized(req: IncomingMessage): boolean {
    const queryToken = extractToken(req.url ?? "/");
    const headerToken = req.headers["x-web-token"];
    const presented = (typeof headerToken === "string" && headerToken.length > 0 ? headerToken : null) ?? queryToken;
    return presented !== null && tokenEquals(token, presented);
  }

  wss.on("connection", (ws: WebSocket) => {
    if (wss.clients.size > maxClients) {
      ws.close(1013, "too many clients");
      return;
    }
    options.onClientChange?.(wss.clients.size);

    ws.on("message", (data) => {
      void handleClientMessage(ws, data.toString());
    });
    ws.on("close", () => options.onClientChange?.(wss.clients.size));
    ws.on("error", () => {
      /* socket 层错误，交由 close 处理 */
    });
  });

  async function handleClientMessage(ws: WebSocket, raw: string): Promise<void> {
    const msg = parseMessage(raw);
    if (msg.kind === "invalid") {
      ws.send(serialize(makeError(null, msg.code, msg.message)));
      return;
    }
    if (msg.kind === "notification") return; // 客户端不应发 notification，忽略
    let response: RpcResponse;
    try {
      const result = await options.handleRequest(msg.id, msg.method, msg.params);
      response = { jsonrpc: "2.0", id: msg.id, result: result === undefined ? null : result };
    } catch (err) {
      if (err instanceof WebServerError) {
        response = makeError(msg.id, err.code, err.message);
      } else if (err instanceof Error && err.message.includes("stale")) {
        response = makeError(msg.id, 3, "会话切换中，请重试");
      } else {
        response = makeError(msg.id, 1, err instanceof Error ? err.message : String(err));
      }
    }
    if (ws.readyState === ws.OPEN) ws.send(serialize(response));
  }

  async function serveStatic(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const pathname = url.pathname;
    if (pathname === "/healthz") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    const filePath = safeResolveWebPath(options.webDir, pathname);
    if (filePath === null) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("not found");
      return;
    }
    try {
      const content = await readFile(filePath);
      res.writeHead(200, { "Content-Type": mimeTypeFor(pathname) });
      res.end(content);
    } catch {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("not found");
    }
  }

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve();
    });
  });

  const address = server.address() as AddressInfo;
  const port = address.port;
  const url = `http://127.0.0.1:${port}/?token=${encodeURIComponent(token)}`;

  return {
    port,
    url,
    get clientCount() {
      return wss.clients.size;
    },
    broadcast(message: string) {
      const payload = message;
      for (const client of wss.clients) {
        if (client.readyState === client.OPEN) client.send(payload);
      }
    },
    async stop() {
      for (const client of wss.clients) {
        client.close(1000, "server stopping");
      }
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
