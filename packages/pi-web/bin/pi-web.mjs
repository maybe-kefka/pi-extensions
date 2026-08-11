#!/usr/bin/env node
/**
 * pi-web：独立 web 服务进程启动器。
 *
 * 等价于：PI_WEB_SERVICE=1 pi --mode rpc --extension <pi-web 入口>
 * - 注：pi CLI 对未知参数报错退出，故服务模式标志走环境变量（PI_WEB_SERVICE），不走 --web 参数
 * - rpc 模式：无 TUI 常驻，扩展以服务模式启动（只起 web 服务，不注册自己、无会话 tab）
 * - 入口自适应：发布构建 dist/index.js 优先，开发源码 src/index.ts 兜底（jiti 直载）
 * - Ctrl+C / SIGTERM 透传终止
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// pi-coding-agent 的 exports 仅 import 条件且不含 cli.js 子路径——import.meta.resolve 主入口后推导 cli.js
let cliPath = null;
try {
  const mainUrl = import.meta.resolve("@earendil-works/pi-coding-agent");
  cliPath = path.join(path.dirname(fileURLToPath(mainUrl)), "cli.js");
} catch {
  cliPath = null;
}
if (!cliPath || !existsSync(cliPath)) {
  console.error("[pi-web] 找不到 pi CLI（@earendil-works/pi-coding-agent）——请确认已安装 pi");
  process.exit(1);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const entry = existsSync(path.join(here, "..", "dist", "index.js"))
  ? path.join(here, "..", "dist", "index.js")
  : path.join(here, "..", "src", "index.ts");

const argv = [cliPath, "--mode", "rpc", "--extension", entry, ...process.argv.slice(2)];
const child = spawn(process.execPath, argv, {
  stdio: "inherit",
  env: { ...process.env, PI_WEB_SERVICE: "1" },
});
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
