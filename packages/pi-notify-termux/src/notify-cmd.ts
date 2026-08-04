/** termux-notification 参数数组构造（纯函数，TDD：test/notify-cmd.test.ts）。
 *  返回可直接被 child_process.spawn 消费的 argv（无 shell 拼接）。
 *  action 字符串由 termux-api 在干净环境（dash -c）执行：一律绝对路径，
 *  `$REPLY` 保持字面（termux-api 的 Direct Reply 会替换为带引号的用户输入）。 */

import { ASK_PREFIX } from "./replies.js";

/** 固定 id：需求 1 结果通知（原地更新） */
export const RESULT_NOTIFICATION_ID = "pi-notify-result";
/** Termux 终端 Activity（打开终端按钮） */
export const TERMUX_ACTIVITY = "com.termux/.app.TermuxActivity";
export const MAX_OPTIONS = 3;

export interface NotificationBase {
  title: string;
  content: string;
  helperPath: string;
}

export interface ResultNotificationArgs extends NotificationBase {
  ts: number;
  amPath: string;
  toastPath: string;
}

export interface AskOptionsArgs extends NotificationBase {
  id: string;
  options: readonly string[];
}

export interface AskInputArgs extends NotificationBase {
  id: string;
}

/** 需求 1：最终回复通知 —— 固定 id 原地更新 + 回复/打开终端按钮
 *  打开终端：用 Termux 的 am（termux-am，app 身份）；失败（如后台启动被系统
 *  限制）时降级 toast 提示原因。 */
export function buildResultNotificationArgs(opts: ResultNotificationArgs): string[] {
  return [
    "--id", RESULT_NOTIFICATION_ID,
    "--title", opts.title,
    "--content", opts.content,
    "--button1", "回复",
    "--button1-action", `${opts.helperPath} notify ${opts.ts} "$REPLY"`,
    "--button2", "打开终端",
    "--button2-action",
    `${opts.amPath} start -n ${TERMUX_ACTIVITY} || ${opts.toastPath} 后台启动被拒：请在系统设置中允许 Termux 后台弹出界面`,
  ];
}

/** 需求 2 options：每个选项一个按钮（1–3 个），点击 = 选择 */
export function buildAskOptionsArgs(opts: AskOptionsArgs): string[] {
  const { options } = opts;
  if (options.length < 1) throw new Error("options 至少 1 项");
  if (options.length > MAX_OPTIONS) throw new Error(`options 最多 ${MAX_OPTIONS} 项，请让 LLM 收敛选项`);

  const args = ["--id", `${ASK_PREFIX}${opts.id}`, "--title", opts.title, "--content", opts.content];
  options.forEach((opt, i) => {
    const n = i + 1;
    args.push(`--button${n}`, opt, `--button${n}-action`, `${opts.helperPath} ask ${opts.id} ${n}`);
  });
  return args;
}

/** 需求 2 input：单个回复按钮（Direct Reply 自由输入） */
export function buildAskInputArgs(opts: AskInputArgs): string[] {
  return [
    "--id", `${ASK_PREFIX}${opts.id}`,
    "--title", opts.title,
    "--content", opts.content,
    "--button1", "回复",
    "--button1-action", `${opts.helperPath} ask ${opts.id} "$REPLY"`,
  ];
}

/** 滑掉通知 = 取消（--on-delete 钩子） */
export function buildOnDeleteArg(opts: { id: string; helperPath: string }): string[] {
  return ["--on-delete", `${opts.helperPath} cancel ${opts.id}`];
}

/** 终结状态通知：同 id 替换（Direct Reply 回复过的通知 remove 被系统忽略，替换是可靠反馈） */
export function buildStatusNotificationArgs(opts: {
  id: string;
  title: string;
  content: string;
}): string[] {
  return ["--id", opts.id, "--title", opts.title, "--content", opts.content];
}

/** 权限自检通知：静默（--alert-once 不响铃不震动），无按钮，发完立即 remove */
export function buildDiagnosticArgs(opts: {
  id: string;
  title: string;
  content: string;
}): string[] {
  return ["--id", opts.id, "--alert-once", "--title", opts.title, "--content", opts.content];
}
