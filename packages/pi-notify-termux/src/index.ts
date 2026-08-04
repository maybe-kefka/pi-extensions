import {
  CONFIG_DIR_NAME,
  type ExtensionAPI,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Type } from "typebox";

import { cancelAsk, checkTimeout, createAsk, resolveAsk, serializeResult, type Ask, type AskResult } from "./ask.js";
import { buildConfigPaths, defaultConfig, loadConfig, parseNotifyCommand, renderStatus, type NotifyConfig } from "./config.js";
import { buildAskContent, buildResultContent, buildStatusContent, buildTitle, hasContent } from "./format.js";
import { buildHelperScript } from "./helper.js";
import { buildAskInputArgs, buildAskOptionsArgs, buildOnDeleteArg, buildResultNotificationArgs, buildStatusNotificationArgs, RESULT_NOTIFICATION_ID } from "./notify-cmd.js";
import { decodeReply, parseFileName } from "./replies.js";

const TERMUX_TERMINAL_ACTIVITY = "com.termux/.app.TermuxActivity";
const POLL_INTERVAL_MS = 500;

interface PendingAsk {
  ask: Ask;
  options: readonly string[];
  resolve: (result: Record<string, unknown>) => void;
}

/** 薄接线层：纯逻辑都在 src/*.ts（TDD），本文件只做事件/tool/命令注册与进程交互。 */
export default function (pi: ExtensionAPI): void {
  const paths = buildConfigPaths(homedir(), CONFIG_DIR_NAME);
  const prefix = process.env.PREFIX ?? "/data/data/com.termux/files/usr";
  let config: NotifyConfig = { ...defaultConfig };
  let envOk = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  let lastAssistantText: string | null = null;
  const pending = new Map<string, PendingAsk>();

  // ---------- 基础设施 ----------

  /** 探测 termux-notification（一次性缓存） */
  function probeEnv(): boolean {
    const r = spawnSync("which", ["termux-notification"], { encoding: "utf8" });
    return r.status === 0;
  }

  /** 生成回传脚本 + 清理残留回复文件（SPEC §4.2）；回复后自动移除通知（helper 内 remove） */
  function ensureHelper(): void {
    mkdirSync(paths.dir, { recursive: true });
    mkdirSync(paths.repliesDir, { recursive: true });
    const script = buildHelperScript({
      repliesDir: paths.repliesDir,
      shBin: `${prefix}/bin/sh`,
    });
    writeFileSync(paths.helperFile, script, { mode: 0o755 });
    for (const f of readdirSync(paths.repliesDir)) {
      rmSync(join(paths.repliesDir, f), { force: true });
    }
  }

  /** 发通知（同步，快；失败返回 stderr） */
  function sendNotification(args: string[]): string | null {
    const r = spawnSync("termux-notification", args, { encoding: "utf8" });
    if (r.error) return r.error.message;
    if (r.status !== 0) return (r.stderr || `exit ${r.status}`).trim();
    return null;
  }

  /** 终结反馈：同 id 替换为状态通知 + toast（remove 在部分设备无效，替换是可靠通道） */
  function replaceWithStatus(id: string, status: "answered" | "timeout"): void {
    sendNotification(
      buildStatusNotificationArgs({
        id,
        title: status === "answered" ? "✅ pi" : "⏰ pi",
        content: buildStatusContent(status),
      }),
    );
    spawnSync("termux-toast", [status === "answered" ? "已收到回复 ✓" : "提问已超时"], { encoding: "utf8" });
  }

  function settle(p: PendingAsk, result: AskResult): void {
    pending.delete(p.ask.id);
    if (result.status === "answered") replaceWithStatus(`ask-${p.ask.id}`, "answered");
    if (result.status === "timeout") replaceWithStatus(`ask-${p.ask.id}`, "timeout");
    p.resolve(serializeResult(result, p.ask.question));
  }

  /** 轮询 replies/ 目录（500ms）：消费回复/取消/超时（SPEC §5.4） */
  function poll(): void {
    let names: string[];
    try {
      names = readdirSync(paths.repliesDir);
    } catch {
      return;
    }
    for (const name of names) {
      const info = parseFileName(name);
      if (!info) continue;
      const full = join(paths.repliesDir, name);
      if (info.type === "cancel") {
        rmSync(full, { force: true });
        const p = pending.get(info.id);
        if (p) {
          const r = cancelAsk(p.ask, Date.now());
          if (r) settle(p, r);
        }
        continue;
      }
      let raw = "";
      try {
        raw = readFileSync(full, "utf8");
        rmSync(full, { force: true });
      } catch {
        continue;
      }
      if (info.kind === "notify") {
        // 需求 1：通知输入 → 下一轮用户消息（空输入忽略）；替换为已收到状态
        const reply = decodeReply(raw);
        if (reply) {
          replaceWithStatus(RESULT_NOTIFICATION_ID, "answered");
          pi.sendUserMessage(reply.text);
        }
        continue;
      }
      const p = pending.get(info.id);
      if (!p) continue;
      const reply = decodeReply(raw);
      let r: AskResult | null;
      if (reply === null) {
        // 空输入 = 取消（SPEC §4.1）
        r = cancelAsk(p.ask, Date.now());
      } else if (p.options.length > 0 && /^\d+$/.test(reply.text.trim())) {
        // options 按钮：helper 写入的是选项序号
        const n = Number(reply.text.trim());
        const opt = p.options[n - 1];
        if (opt !== undefined) {
          r = resolveAsk(p.ask, { selection: n, option: opt, text: opt }, Date.now());
        } else {
          r = resolveAsk(p.ask, { selection: null, option: null, text: reply.text }, Date.now());
        }
      } else {
        // 自由输入
        r = resolveAsk(p.ask, { selection: null, option: null, text: reply.text }, Date.now());
      }
      if (r) settle(p, r);
    }
    // 超时检查
    for (const [, p] of pending) {
      const r = checkTimeout(p.ask, Date.now());
      if (r) settle(p, r);
    }
  }

  // ---------- /notify 命令 ----------

  pi.registerCommand("notify", {
    description: "Toggle Android notifications (pi-notify-termux): on/off, no arg = status",
    handler: async (args, ctx) => {
      const parsed = parseNotifyCommand(args);
      if ("error" in parsed) {
        ctx.ui.notify(parsed.error, "error");
        return;
      }
      if (parsed.action === "on" || parsed.action === "off") {
        config = { ...config, enabled: parsed.action === "on" };
        try {
          mkdirSync(paths.dir, { recursive: true });
          writeFileSync(paths.configFile, JSON.stringify(config, null, 2));
          ctx.ui.notify(`pi 通知已${parsed.action === "on" ? "开启" : "关闭"}`, "info");
        } catch (e) {
          ctx.ui.notify(`配置写入失败：${String(e)}`, "error");
        }
        return;
      }
      ctx.ui.notify(renderStatus({ enabled: config.enabled, envOk, permOk: true }), "info");
    },
  });

  // ---------- tools（需求 2：通知提问，阻塞等待） ----------

  /** 公共执行体：发通知 + 挂起等待回复（回复/取消/超时 → 结构化结果） */
  async function askAndWait(input: {
    question: string;
    options: readonly string[];
    timeoutSec: number;
    ctx: ExtensionContext;
    signal?: AbortSignal;
  }): Promise<{ content: { type: "text"; text: string }[]; details: Record<string, unknown> }> {
    if (input.ctx.mode !== "tui") {
      return { content: [{ type: "text", text: JSON.stringify({ status: "error", error: "pi-notify-termux 仅 TUI 模式可用" }) }], details: {} };
    }
    if (!envOk) {
      return { content: [{ type: "text", text: JSON.stringify({ status: "error", error: "termux-notification 不可用：请安装 Termux:API app 并 pkg install termux-api" }) }], details: {} };
    }
    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const ask = createAsk({
      id,
      question: input.question,
      timeoutMs: input.timeoutSec > 0 ? input.timeoutSec * 1000 : 0,
      now: Date.now(),
    });
    const title = buildTitle("ask", new Date());
    const args =
      input.options.length > 0
        ? buildAskOptionsArgs({ id, title, content: buildAskContent(input.question, input.options), options: input.options, helperPath: paths.helperFile })
        : buildAskInputArgs({ id, title, content: buildAskContent(input.question), helperPath: paths.helperFile });
    const err = sendNotification([...args, ...buildOnDeleteArg({ id, helperPath: paths.helperFile })]);
    if (err !== null) {
      return { content: [{ type: "text", text: JSON.stringify({ status: "error", error: `通知发送失败：${err}` }) }], details: {} };
    }
    const result = await new Promise<Record<string, unknown>>((resolve) => {
      const p: PendingAsk = { ask, options: input.options, resolve };
      pending.set(id, p);
      const onAbort = (): void => {
        const r = cancelAsk(ask, Date.now());
        if (r) settle(p, r);
      };
      input.signal?.addEventListener("abort", onAbort, { once: true });
    });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], details: result };
  }

  pi.registerTool({
    name: "notify_ask_options",
    label: "通过 Android 通知提问（选项按钮）",
    description:
      "向用户发送一个 Android 系统通知，提供最多 3 个选项按钮，用户点击后返回选择结果。适用于用户不在终端/需要即时决策的场景。阻塞等待用户回复（默认 5 分钟，用户滑掉通知视为取消）。",
    promptSnippet: "Ask the user a question via Android notification with up to 3 option buttons",
    promptGuidelines: [
      "Use notify_ask_options when the user is likely away from the terminal and you need a decision from a finite set of choices (max 3).",
      "Use notify_ask_options only when options are truly limited; for free-form text answers use notify_ask_input.",
      "Do not call notify_ask_options when the user is actively typing in the terminal — a notification is unnecessary there.",
    ],
    parameters: Type.Object({
      question: Type.String({ description: "要问的问题" }),
      options: Type.Array(Type.String(), { minItems: 1, maxItems: 3, description: "选项（1–3 个，每个渲染为一个通知按钮）" }),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      return askAndWait({ question: params.question, options: params.options, timeoutSec: config.timeoutSec, ctx, signal });
    },
  });

  pi.registerTool({
    name: "notify_ask_input",
    label: "通过 Android 通知提问（自由输入）",
    description:
      "向用户发送一个 Android 系统通知，用户可在通知内直接输入文字回复。适用于用户不在终端、需要自由文本输入的场景。阻塞等待用户回复（默认 5 分钟，可传 timeout 覆盖；0 = 不超时；用户滑掉通知视为取消）。",
    promptSnippet: "Ask the user for free-form text input via Android notification",
    promptGuidelines: [
      "Use notify_ask_input when the user is likely away from the terminal and the answer cannot be reduced to a few options.",
      "Use notify_ask_input for short free-form answers; for finite choices use notify_ask_options.",
      "Do not call notify_ask_input when the user is actively typing in the terminal — a notification is unnecessary there.",
    ],
    parameters: Type.Object({
      question: Type.String({ description: "要问的问题" }),
      timeout: Type.Optional(Type.Integer({ minimum: 0, description: "超时秒数（默认取配置 timeoutSec；0 = 永不超时）" })),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      return askAndWait({ question: params.question, options: [], timeoutSec: params.timeout ?? config.timeoutSec, ctx, signal });
    },
  });

  // ---------- 事件（需求 1：agent 结束通知） ----------

  pi.on("session_start", async (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    config = loadConfig(readFileSafe(paths.configFile));
    envOk = probeEnv();
    try {
      ensureHelper();
    } catch {
      // helper 生成失败：tool 调用时会再次失败并报错，这里不阻塞会话
    }
    timer = setInterval(poll, POLL_INTERVAL_MS);
    if (!envOk) {
      ctx.ui.notify(
        renderStatus({ enabled: config.enabled, envOk: false, permOk: true }),
        "error",
      );
    }
  });

  pi.on("agent_end", (event) => {
    // 缓存本次 run 的最后一条 assistant 文本（settled 时才发通知，确保是最终回复）
    lastAssistantText = extractAssistantText(event.messages);
  });

  pi.on("agent_settled", async (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    const text = lastAssistantText;
    lastAssistantText = null;
    if (!config.enabled || !envOk || text === null || !hasContent(text)) return;
    const args = buildResultNotificationArgs({
      title: buildTitle("result", new Date()),
      content: buildResultContent(text),
      helperPath: paths.helperFile,
      amPath: `${prefix}/bin/am`,
      ts: Date.now(),
    });
    const err = sendNotification(args);
    if (err !== null) {
      ctx.ui.notify(`pi 通知发送失败：${err}`, "error");
    }
  });

  pi.on("session_shutdown", () => {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
    for (const [, p] of pending) {
      const r = cancelAsk(p.ask, Date.now());
      if (r) settle(p, r);
    }
    pending.clear();
  });
}

// ---------- 文件读取辅助（配置容错） ----------

function readFileSafe(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

/** 从 agent run 消息里提取最后一条非空 assistant 文本（content 兼容 string / 文本块数组） */
function extractAssistantText(messages: unknown): string | null {
  if (!Array.isArray(messages)) return null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i] as { role?: unknown; content?: unknown } | null;
    if (!m || m.role !== "assistant") continue;
    const text = textFromContent(m.content);
    if (text !== null && text.trim().length > 0) return text;
  }
  return null;
}

function textFromContent(content: unknown): string | null {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const c of content) {
      const block = c as { type?: unknown; text?: unknown } | null;
      if (block && block.type === "text" && typeof block.text === "string") {
        parts.push(block.text);
      }
    }
    if (parts.length > 0) return parts.join("\n");
  }
  return null;
}
