/** 配置与 /notify 命令解析（纯函数，TDD：test/config.test.ts）。
 *  配置存 <home>/<configDirName>/pi-notify-termux/config.json（SPEC D10）。 */

import { join } from "node:path";

export interface NotifyConfig {
  enabled: boolean;
  timeoutSec: number;
}

export const defaultConfig: NotifyConfig = { enabled: true, timeoutSec: 300 };

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
  return { enabled, timeoutSec };
}

/** 读文件内容 → 配置（文件不存在/读失败 → 默认） */
export function loadConfig(raw: string | null | undefined): NotifyConfig {
  return parseConfig(raw ?? "");
}

export type NotifyCommandAction = "on" | "off" | "status";

export type NotifyCommandResult =
  | { action: NotifyCommandAction }
  | { error: string };

/** `/notify [on|off]` 参数解析；无参 = 查状态 */
export function parseNotifyCommand(arg: string | undefined): NotifyCommandResult {
  const a = (arg ?? "").trim();
  if (a === "on") return { action: "on" };
  if (a === "off") return { action: "off" };
  if (a === "") return { action: "status" };
  return { error: `未知参数 "${a}"，用法：/notify on|off（无参查看状态）` };
}

export interface StatusInput {
  enabled: boolean;
  envOk: boolean;
  permOk: boolean;
}

/** 状态文案（含 Android 13+ 权限 / termux-api 前置提示） */
export function renderStatus(input: StatusInput): string {
  const lines = [`pi 通知：${input.enabled ? "已开启" : "已关闭"}`];
  if (!input.envOk) {
    lines.push("⚠️ 未找到 termux-notification：请安装 Termux:API app 并 `pkg install termux-api`");
  }
  if (!input.permOk) {
    lines.push("⚠️ Android 13+ 需在 设置 → 应用 → Termux → 通知 中授予通知权限，否则通知静默失败");
  }
  return lines.join("\n");
}
