/**
 * /web 命令参数解析（纯函数）。
 * SPEC §2.1。
 */

export interface WebArgs {
  /** 0 = 随机空闲端口 */
  port: number;
  open: boolean;
  stop: boolean;
}

export type ArgsResult =
  | { ok: true; value: WebArgs }
  | { ok: false; error: string };

export const USAGE = "用法: /web [--port <n> | --port=<n> | -p <n>] [--open] [--stop]";

const PORT_TOKEN_RE = /^(?:--port|-p)(?:=(\d+))?$/;
const PORT_VALUE_RE = /^\d+$/;

export function parseArgs(input: string | undefined): ArgsResult {
  const tokens = (input ?? "").trim().split(/\s+/).filter((t) => t.length > 0);
  const args: WebArgs = { port: 0, open: false, stop: false };

  let i = 0;
  while (i < tokens.length) {
    const tok = tokens[i];

    if (tok === "--open") {
      args.open = true;
      i += 1;
      continue;
    }
    if (tok === "--stop") {
      args.stop = true;
      i += 1;
      continue;
    }

    const match = PORT_TOKEN_RE.exec(tok);
    if (match) {
      let value: string;
      if (match[1] !== undefined) {
        value = match[1];
        i += 1;
      } else {
        const next = tokens[i + 1];
        if (next === undefined || !PORT_VALUE_RE.test(next)) {
          return { ok: false, error: `--port 需要一个数字参数\n${USAGE}` };
        }
        value = next;
        i += 2;
      }
      const n = Number(value);
      if (!Number.isInteger(n) || n < 0 || n > 65535) {
        return { ok: false, error: `无效端口: ${value}（范围 0-65535，0 = 随机）` };
      }
      args.port = n;
      continue;
    }

    return { ok: false, error: `未知参数: ${tok}\n${USAGE}` };
  }

  return { ok: true, value: args };
}
