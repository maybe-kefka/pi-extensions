/**
 * 端口存活探测（残留状态文件检测）——纯函数 + 注入 connect（可单测）。
 */
import type { Socket } from "node:net";

export type ConnectFn = (opts: { port: number; host: string }) => Socket;

/** 探测端口是否可连接（短超时）；connect 注入（默认 node:net.connect） */
export function portAlive(port: number, connect: ConnectFn, timeoutMs = 800): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ port, host: "127.0.0.1" });
    const done = (ok: boolean) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
    socket.once("timeout", () => done(false));
  });
}
