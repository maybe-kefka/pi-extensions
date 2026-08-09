/**
 * RPC 派发器（DDD interface 层，无单测——薄派发，行为经冒烟验证）。
 * pi:sendMessage / pi:listFiles 等 18 个客户端方法；校验 → 领域/应用层调用 → 返回。
 */

import type { ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { WebServerError } from "../infrastructure/server.js";
import {
  computeConversationTokens,
  contextMessagesFromEntries,
  estimateTextTokens,
  parseSystemPromptSections,
  type ContextCategory,
  type ConversationTokens,
} from "../domain/context-breakdown.js";
import { expandSkillChips, type SkillLookupEntry } from "../domain/skill-expand.js";
import { readFileSync } from "node:fs";
import { listFiles } from "../domain/file-lister.js";
import { resolveUserEntryId } from "../domain/fork-util.js";
import { deleteSessionFile } from "../infrastructure/session-files.js";
import { messageTextOf, messageThinkingOf, messageToolCalls } from "../infrastructure/http-util.js";
import { THINKING_LEVELS, SessionManager, type BuildSystemPromptOptions, type WebConsole } from "../application/web-console.js";

export function registerRpcHandler(console: WebConsole): void {
  console.handleRequest = (id, method, params) => handleRequest(console, id, method, params);
}

async function handleRequest(
  console: WebConsole,
  id: string | number,
  method: string,
  params: Record<string, unknown>,
): Promise<unknown> {
  const { state } = console;
  const requireCtxOf = (): ExtensionContext => console.requireCtx();
  const privilegedCall = <T>(fn: (priv: import("@earendil-works/pi-coding-agent").ExtensionCommandContext) => Promise<T>): Promise<T> =>
    console.privilegedCall(fn);
  const withPrivilegedRefresh = <T extends object>(options: T) => console.withPrivilegedRefresh(options);

  switch (method) {
    case "pi:sendMessage": {
      const text = params.text;
      if (typeof text !== "string" || text.trim() === "") {
        throw new WebServerError(-32602, "text 必须是非空字符串");
      }
      const deliverAs = params.deliverAs;
      if (deliverAs !== undefined && deliverAs !== "steer" && deliverAs !== "followUp") {
        throw new WebServerError(-32602, "deliverAs 只能是 steer 或 followUp");
      }
      if (!state.api) throw new WebServerError(3, "扩展未就绪");
      try {
        // R22：只展开 chip 标记内的 skill（skill:name → XML；file 标记剥路径）——
        // sendUserMessage 硬编码 expandPromptTemplates:false，pi 内核不展开（基线 SPEC §40）
        const expanded = expandSkillChips(text.trim(), skillLookupFrom(state.api));
        state.api.sendUserMessage(expanded, deliverAs ? { deliverAs } : undefined);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes("Agent is already processing")) {
          throw new WebServerError(2, `agent 正在处理，请指定 deliverAs（"steer" 打断 / "followUp" 排队）`);
        }
        throw new WebServerError(1, message);
      }
      return null;
    }

    case "pi:abort": {
      requireCtxOf().abort();
      return null;
    }

    case "pi:compact": {
      // R21：错误不再静默——pi 端（会话太小/已压缩等）异常经 onError → notify 广播 → 前端侧栏通知
      requireCtxOf().compact({
        onError: (e: Error) => {
          console.broadcast("notify", { message: `压缩失败：${e.message}`, notifyType: "error" });
        },
      });
      return null;
    }

    case "pi:listSessions": {
      const ctx = requireCtxOf();
      const sessions = await SessionManager.list(ctx.cwd);
      return sessions.map((s) => ({
        path: s.path,
        name: s.name ?? null,
        cwd: s.cwd,
        messageCount: s.messageCount,
        firstMessage: s.firstMessage,
        modified: s.modified.toISOString(),
      }));
    }

    case "pi:switchSession": {
      const path = params.path;
      if (typeof path !== "string" || path.trim() === "") {
        throw new WebServerError(-32602, "需要 path");
      }
      const result = await privilegedCall((priv) =>
        priv.switchSession(path, withPrivilegedRefresh({})),
      );
      return { cancelled: result.cancelled };
    }

    case "pi:newSession": {
      const result = await privilegedCall((priv) => priv.newSession(withPrivilegedRefresh({})));
      return { cancelled: result.cancelled };
    }

    case "pi:fork": {
      const userIndex = params.userIndex;
      if (typeof userIndex !== "number" || !Number.isInteger(userIndex) || userIndex < 0) {
        throw new WebServerError(-32602, "userIndex 必须是非负整数");
      }
      const ctx = requireCtxOf();
      const entryId = resolveUserEntryId(
        ctx.sessionManager.getEntries() as { type?: string; message?: { role?: string } | null; id?: string }[],
        userIndex,
      );
      if (!entryId) {
        throw new WebServerError(1, `找不到第 ${userIndex} 条用户消息（序号越界？）`);
      }
      const result = await privilegedCall((priv) =>
        priv.fork(entryId, withPrivilegedRefresh({ position: "before" as const })),
      );
      return { cancelled: result.cancelled };
    }

    case "pi:clone": {
      const ctx = requireCtxOf();
      const leafId = ctx.sessionManager.getLeafId();
      if (!leafId) {
        throw new WebServerError(1, "当前会话没有可克隆的条目");
      }
      const result = await privilegedCall((priv) => priv.fork(leafId, withPrivilegedRefresh({ position: "at" as const })));
      return { cancelled: result.cancelled };
    }

    case "pi:navigateTree": {
      const targetId = params.targetId;
      if (typeof targetId !== "string" || targetId.trim() === "") {
        throw new WebServerError(-32602, "需要 targetId");
      }
      const result = await privilegedCall((priv) => priv.navigateTree(targetId));
      return { cancelled: result.cancelled };
    }

    case "pi:getTree": {
      const ctx = requireCtxOf();
      return { tree: ctx.sessionManager.getTree(), leafId: ctx.sessionManager.getLeafId() ?? null };
    }

    case "pi:deleteSession": {
      const path = params.path;
      if (typeof path !== "string" || path.trim() === "") {
        throw new WebServerError(-32602, "需要 path");
      }
      const ctx = requireCtxOf();
      const result = await deleteSessionFile(
        ctx.sessionManager.getSessionDir(),
        path,
        ctx.sessionManager.getSessionFile() ?? null,
      );
      if (!result.ok) {
        throw new WebServerError(1, result.error ?? "删除失败");
      }
      return null;
    }

    case "pi:setSessionName": {
      const name = params.name;
      if (typeof name !== "string") {
        throw new WebServerError(-32602, "需要 name");
      }
      if (!state.api) throw new WebServerError(3, "扩展未就绪");
      state.api.setSessionName(name.trim());
      return null;
    }

    case "pi:listSkills": {
      if (!state.api) throw new WebServerError(3, "扩展未就绪");
      return state.api
        .getCommands()
        .filter((c) => c.source === "skill")
        .map((c) => ({
          // pi 对 skill 命令返回的 name 带 "skill:" 前缀（如 skill:code-review），
          // 前端展示/插入需要裸名字（/code-review → /skill:code-review）
          name: c.name.replace(/^skill:/, ""),
          description: c.description ?? null,
        }));
    }

    case "pi:listCommands": {
      // "/" 上拉框非 skill 命令列表（选中插纯文本，不执行，见 SPEC §1.4）
      if (!state.api) throw new WebServerError(3, "扩展未就绪");
      return state.api
        .getCommands()
        .filter((c) => c.source !== "skill")
        .map((c) => ({ name: c.name, description: c.description ?? null }));
    }

    case "pi:getContextBreakdown": {
      // R20 双轨：特权 ctx（完整 getSystemPrompt + getSystemPromptOptions）优先；
      // 特权失效（TUI 手动切会话 / 未跑 /web）→ 降级事件 ctx getSystemPrompt 文本解析。
      // 根因（源码核实）：事件 ctx（createContext()）无 getSystemPromptOptions——
      // 仅特权命令 ctx（createCommandContext()）有——旧实现 ?.() 静默 undefined → 系统侧恒 0。
      const ctx = requireCtxOf();
      const messages = contextMessagesFromEntries(ctx.sessionManager.buildContextEntries());
      const conversation = computeConversationTokens(messages);
      try {
        const breakdown = await console.privilegedCall(async (priv) => {
          const systemText = priv.getSystemPrompt();
          const system = estimateTextTokens(systemText);
          const options = (priv as ExtensionCommandContext & { getSystemPromptOptions?: () => BuildSystemPromptOptions })
            .getSystemPromptOptions?.();
          const contextFiles = (options?.contextFiles ?? []).reduce(
            (sum, f) => sum + estimateTextTokens(`${f.path}\n${f.content}`),
            0,
          );
          const skills = (options?.skills ?? []).reduce(
            (sum, s) => sum + estimateTextTokens(`${s.name} ${s.description ?? ""}`.trim()),
            0,
          );
          const tools = Object.values(options?.toolSnippets ?? {}).reduce((sum, v) => sum + estimateTextTokens(v), 0);
          return buildBreakdownResult({ system, contextFiles, skills, tools, conversation }, ctx);
        });
        return breakdown;
      } catch {
        // 降级：事件 ctx getSystemPrompt（有该方法）+ 文本段解析；
        // 解析失败 → 明细 0 但 system 非 0（优雅降级）
        const systemText =
          (ctx as ExtensionContext & { getSystemPrompt?: () => string }).getSystemPrompt?.() ?? "";
        const sections = parseSystemPromptSections(systemText);
        return buildBreakdownResult(
          {
            system: estimateTextTokens(systemText),
            contextFiles: sections.contextFiles,
            skills: sections.skills,
            tools: sections.tools,
            conversation,
          },
          ctx,
        );
      }
    }

    case "pi:listFiles": {
      const ctx = requireCtxOf();
      const maxDepth = typeof params.maxDepth === "number" ? params.maxDepth : 3;
      const limit = typeof params.limit === "number" ? params.limit : 200;
      return listFiles(ctx.cwd, { maxDepth, limit });
    }

    case "pi:listModels": {
      const ctx = requireCtxOf();
      return ctx.modelRegistry
        .getAvailable()
        .map((m) => ({ provider: m.provider, id: m.id, name: m.name ?? m.id }));
    }

    case "pi:setModel": {
      const provider = params.provider;
      const modelId = params.modelId;
      if (typeof provider !== "string" || typeof modelId !== "string") {
        throw new WebServerError(-32602, "需要 provider 与 modelId");
      }
      const ctx = requireCtxOf();
      const model = ctx.modelRegistry.find(provider, modelId);
      if (!model) throw new WebServerError(1, `模型不存在: ${provider}/${modelId}`);
      if (!state.api) throw new WebServerError(3, "扩展未就绪");
      const ok = await state.api.setModel(model);
      if (!ok) throw new WebServerError(1, "该模型无可用 API key");
      return { provider, modelId };
    }

    case "pi:getThinkingLevel": {
      if (!state.api) throw new WebServerError(3, "扩展未就绪");
      return { level: state.api.getThinkingLevel() };
    }

    case "pi:setThinkingLevel": {
      const level = params.level;
      if (typeof level !== "string" || !THINKING_LEVELS.has(level)) {
        throw new WebServerError(-32602, `level 必须是 ${[...THINKING_LEVELS].join("/")} 之一`);
      }
      if (!state.api) throw new WebServerError(3, "扩展未就绪");
      state.api.setThinkingLevel(level as never);
      return null;
    }

    case "pi:listCommands": {
      if (!state.api) throw new WebServerError(3, "扩展未就绪");
      return state.api
        .getCommands()
        .map((c) => ({ name: c.name, description: c.description ?? null, source: c.source }));
    }

    case "pi:getMessages": {
      const ctx = requireCtxOf();
      const entries = ctx.sessionManager.getEntries() as {
        type?: string;
        message?: { role?: string; content?: unknown; toolCallId?: unknown; isError?: unknown };
      }[];
      // 第一遍：toolResult 结果按 toolCallId 索引
      const resultById = new Map<string, { result: string; isError: boolean }>();
      for (const e of entries) {
        const m = e?.message;
        if (e?.type !== "message" || !m || m.role !== "toolResult" || m.toolCallId == null) continue;
        resultById.set(String(m.toolCallId), { result: messageTextOf(m.content), isError: m.isError === true });
      }
      // 第二遍：组装消息（assistant 带 toolCalls；user 带 userIndex；空消息筛掉）
      const messages: {
        role: string;
        text: string;
        thinking: string;
        toolCalls: { id: string; name: string; arguments: unknown; result: string; isError: boolean }[];
        userIndex?: number;
      }[] = [];
      let userIndex = -1;
      for (const e of entries) {
        const m = e?.message;
        if (e?.type !== "message" || !m) continue;
        const role = m.role ?? "unknown";
        if (role === "toolResult") continue;
        if (role === "assistant") {
          const toolCalls = messageToolCalls(m.content).map((tc) => {
            const r = resultById.get(tc.id);
            return { ...tc, result: r?.result ?? "", isError: r?.isError ?? false };
          });
          const text = messageTextOf(m.content);
          const thinking = messageThinkingOf(m.content);
          if (!text && !thinking && toolCalls.length === 0) continue; // 空消息直接筛掉
          messages.push({ role, text, thinking, toolCalls });
        } else {
          userIndex += 1;
          messages.push({ role, text: messageTextOf(m.content), thinking: "", toolCalls: [], userIndex });
        }
      }
      return { messages };
    }

    case "pi:getState": {
      const snapshot = console.buildStateSnapshot();
      if (!snapshot) throw new WebServerError(3, "会话未就绪（切换中？），请重试");
      return snapshot;
    }

    default:
      throw new WebServerError(-32601, `未知方法: ${method}`);
  }
}

/** R20：组装 context breakdown 返回（total = system + conversation；明细不参与 total） */
function buildBreakdownResult(
  parts: {
    system: number;
    contextFiles: number;
    skills: number;
    tools: number;
    conversation: ConversationTokens;
  },
  ctx: ExtensionContext,
): {
  categories: ContextCategory[];
  conversation: ConversationTokens;
  total: number;
  usage: { tokens: number | null; contextWindow: number; percent: number | null } | null;
} {
  const categories: ContextCategory[] = [
    { key: "system", label: "系统提示词", tokens: parts.system },
    { key: "contextFiles", label: "上下文文件", tokens: parts.contextFiles },
    { key: "skills", label: "技能", tokens: parts.skills },
    { key: "tools", label: "工具定义", tokens: parts.tools },
    { key: "conversation", label: "对话消息", tokens: parts.conversation.total },
  ];
  const total = parts.system + parts.conversation.total;
  const usage = ctx.getContextUsage();
  return {
    categories,
    conversation: parts.conversation,
    total,
    usage: usage
      ? {
          tokens: usage.tokens,
          contextWindow: usage.contextWindow,
          percent: usage.percent == null ? null : usage.percent / 100,
        }
      : null,
  };
}

/** R22：从扩展 API 收集 skill 元数据（getCommands 的 skill 命令 sourceInfo 含路径与 baseDir） */
function skillLookupFrom(api: { getCommands: () => { name: string; source: string; sourceInfo?: { path: string; baseDir?: string } }[] }): SkillLookupEntry[] {
  const out: SkillLookupEntry[] = [];
  for (const c of api.getCommands()) {
    if (c.source !== "skill" || !c.sourceInfo?.path) continue;
    const name = c.name.replace(/^skill:/, "");
    try {
      out.push({
        name,
        path: c.sourceInfo.path,
        baseDir: c.sourceInfo.baseDir ?? c.sourceInfo.path,
        content: readFileSync(c.sourceInfo.path, "utf-8"),
      });
    } catch {
      // 文件不可读的 skill 跳过（展开时保留原文标记）
    }
  }
  return out;
}
