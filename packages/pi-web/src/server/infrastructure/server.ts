/**
 * HTTP + WebSocket 服务器（薄层）。
 * SPEC §4 / §5 / §7：127.0.0.1 绑定、token 校验、静态文件、JSON-RPC 派发。
 */

import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { WebSocketServer, type WebSocket } from "ws";
import { extractToken, mimeTypeFor, safeResolveWebPath, tokenEquals } from "./http-util.js";
import { isStaleError } from "../domain/fork-util.js";
import { makeError, parseMessage, RPC_ERROR, serialize, type RpcResponse } from "../domain/protocol.js";

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
  /** 向注册者进程下发命令（send/abort） */
  sendAgentCommand(processId: string, command: Record<string, unknown>): void;
  stop(): Promise<void>;
}

export interface AgentConnection {
  /** 注册者 WS 句柄（命令下行用） */
  sendCommand(command: Record<string, unknown>): void;
  close(): void;
}

export interface AgentEvents {
  /** 注册者 hello（新进程入列）；返回 processId */
  onAgentHello: (info: {
    pid: number;
    cwd: string;
    sessionFile: string | null;
    sessionName: string | null;
    kind?: string;
  }) => string;
  /** 注册者事件上行（转发浏览器，附加 processId） */
  onAgentEvent: (processId: string, event: Record<string, unknown>) => void;
  /** 注册者断开（进程表移除 + 浏览器 tab 关闭） */
  onAgentClose: (processId: string) => void;
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
  /** 注册者（对等 pi 实例）事件通道 */
  agentEvents?: AgentEvents;
}

const DEFAULT_MAX_CLIENTS = 16;
const COOKIE_NAME = "piweb";

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    try {
      out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
    } catch {
      /* 坏 cookie 忽略 */
    }
  }
  return out;
}

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
      // 首次授权后种下 HttpOnly cookie：子资源（/assets/*.js）自动带 cookie 通过校验
      const cookies = parseCookies(req.headers.cookie);
      if (!cookies[COOKIE_NAME] || !tokenEquals(token, cookies[COOKIE_NAME])) {
        res.setHeader("Set-Cookie", `${COOKIE_NAME}=${token}; HttpOnly; SameSite=Strict; Path=/`);
      }
      await serveStatic(req, res);
    } catch {
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      }
      res.end("internal error");
    }
  });

  const agentWss = new WebSocketServer({ noServer: true });
  const agentInfoByWs = new WeakMap<WebSocket, { processId: string }>();

  server.on("upgrade", (req, socket, head) => {
    if (!isAuthorized(req)) {
      socket.destroy();
      return;
    }
    const path = (req.url ?? "/").split("?")[0];
    if (path === "/agent") {
      agentWss.handleUpgrade(req, socket, head, (ws) => {
        agentWss.emit("connection", ws, req);
      });
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  // 注册者通道：hello → welcome(processId)；event 上行；command 下行
  if (options.agentEvents) {
    agentWss.on("connection", (ws: WebSocket) => {
      ws.on("message", (data) => {
        let msg: { type?: string } & Record<string, unknown>;
        try {
          msg = JSON.parse(data.toString());
        } catch {
          return;
        }
        if (msg.type === "hello") {
          const processId = options.agentEvents!.onAgentHello({
            pid: typeof msg.pid === "number" ? msg.pid : -1,
            cwd: typeof msg.cwd === "string" ? msg.cwd : "",
            sessionFile: typeof msg.sessionFile === "string" ? msg.sessionFile : null,
            sessionName: typeof msg.sessionName === "string" ? msg.sessionName : null,
            kind: typeof msg.kind === "string" ? msg.kind : "external",
          });
          agentInfoByWs.set(ws, { processId });
          ws.send(JSON.stringify({ type: "welcome", processId }));
          return;
        }
        const info = agentInfoByWs.get(ws);
        if (!info) return;
        if (msg.type === "event") {
          options.agentEvents!.onAgentEvent(info.processId, (msg.event as Record<string, unknown>) ?? {});
        }
      });
      const handleAgentGone = () => {
        console.log(`[pi-web] agent socket gone (close/error)`);
        const info = agentInfoByWs.get(ws);
        if (info) options.agentEvents!.onAgentClose(info.processId);
      };
      ws.on("close", handleAgentGone);
      // kill -9（TCP RST）只触发 error 不触发 close——同样清理注册表
      ws.on("error", handleAgentGone);
    });
  }

  function isAuthorized(req: IncomingMessage): boolean {
    const queryToken = extractToken(req.url ?? "/");
    const headerToken = req.headers["x-web-token"];
    const cookieToken = parseCookies(req.headers.cookie)[COOKIE_NAME] ?? null;
    const presented =
      (typeof headerToken === "string" && headerToken.length > 0 ? headerToken : null) ??
      queryToken ??
      cookieToken;
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
      } else if (isStaleError(err)) {
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
      // MIME 必须按解析出的实际文件路径算，而不是 URL pathname：
      // 根路径 "/" 解析为 index.html，但 pathname 无扩展名，会错回 octet-stream
      res.writeHead(200, { "Content-Type": mimeTypeFor(filePath) });
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
    sendAgentCommand(processId: string, command: Record<string, unknown>) {
      let sent = false;
      for (const ws of agentWss.clients) {
        if (ws.readyState === ws.OPEN && agentInfoByWs.get(ws)?.processId === processId) {
          ws.send(JSON.stringify({ type: "command", ...command }));
          sent = true;
        }
      }
      if (!sent) throw new Error(`agent 未连接：${processId}`);
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
