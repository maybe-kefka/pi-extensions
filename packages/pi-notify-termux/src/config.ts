/** 配置与 /notify 命令解析（纯函数，TDD：test/config.test.ts）。
 *  配置存 <home>/<configDirName>/pi-notify-termux/config.json（SPEC D10）。 */

import { join } from "node:path";

export interface NotifyConfig {
  enabled: boolean;
  timeoutSec: number;
  /** 确认引导：before_agent_start 每 turn 注入确认提示词（引导 LLM 不确定时用 notify 工具问用户） */
  confirmPrompt: boolean;
}

export const defaultConfig: NotifyConfig = { enabled: true, timeoutSec: 300, confirmPrompt: true };

export interface ConfigPaths {
  dir: string;
  configFile: string;
  helperFile: string;
  repliesDir: string;
}

/** 路径构建：统一在用户级 pi 配置目录下建扩展子目录（不硬编码 `.pi`） */
export function buildConfigPaths(home: string, configDirName: string): ConfigPaths {
  const dir = join(home, configDirName, "pi-notify-termux");
  return {
    dir,
    configFile: join(dir, "config.json"),
    helperFile: join(dir, "helper.sh"),
    repliesDir: join(dir, "replies"),
  };
}

/** JSON 字符串 → 配置；非法 JSON/缺字段/非法值 → 逐字段回退默认 */
export function parseConfig(raw: string): NotifyConfig {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ...defaultConfig };
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return { ...defaultConfig };
  }
  const obj = data as Record<string, unknown>;
  const enabled =
    typeof obj.enabled === "boolean" ? obj.enabled : defaultConfig.enabled;
  const timeoutSec =
    typeof obj.timeoutSec === "number" &&
    Number.isInteger(obj.timeoutSec) &&
    obj.timeoutSec > 0
      ? obj.timeoutSec
      : defaultConfig.timeoutSec;
  const confirmPrompt =
    typeof obj.confirmPrompt === "boolean"
      ? obj.confirmPrompt
      : defaultConfig.confirmPrompt;
  return { enabled, timeoutSec, confirmPrompt };
}

export type NotifyCommandAction =
  | "on"
  | "off"
  | "status"
  | "confirm-on"
  | "confirm-off"
  | "confirm-status";

export type NotifyCommandResult =
  | { action: NotifyCommandAction }
  | { error: string };

/** `/notify [on|off|confirm [on|off]]` 参数解析；无参 = 查状态 */
export function parseNotifyCommand(arg: string | undefined): NotifyCommandResult {
  const a = (arg ?? "").trim();
  if (a === "on") return { action: "on" };
  if (a === "off") return { action: "off" };
  if (a === "confirm") return { action: "confirm-status" };
  if (a === "confirm on") return { action: "confirm-on" };
  if (a === "confirm off") return { action: "confirm-off" };
  if (a === "") return { action: "status" };
  return {
    error: `未知参数 "${a}"，用法：/notify on|off|confirm [on|off]（无参查看状态）`,
  };
}

export interface StatusInput {
  enabled: boolean;
  envOk: boolean;
  confirmPrompt: boolean;
}

/** 状态文案（含 termux-api 前置提示；通知权限无法程序化探测，README 权限矩阵说明） */
export function renderStatus(input: StatusInput): string {
  const lines = [
    `pi 通知：${input.enabled ? "已开启" : "已关闭"}`,
    `确认引导：${input.confirmPrompt ? "已开启（LLM 不确定时会优先用通知提问）" : "已关闭"}`,
  ];
  if (!input.envOk) {
    lines.push("⚠️ 未找到 termux-notification：请安装 Termux:API app 并 `pkg install termux-api`");
  }
  return lines.join("\n");
}
