/**
 * RPC 派发器（DDD interface 层，无单测——薄派发，行为经冒烟验证）。
 * pi:sendMessage / pi:listFiles 等 18 个客户端方法；校验 → 领域/应用层调用 → 返回。
 */

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { WebServerError } from "../infrastructure/server.js";
import { computeContextBreakdown, contextMessagesFromEntries } from "../domain/context-breakdown.js";
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
  _id: string | number,
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
        state.api.sendUserMessage(text.trim(), deliverAs ? { deliverAs } : undefined);
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
      requireCtxOf().compact();
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
      // 数据源均在普通会话 ctx 上（非特权），TUI 手动切会话后依然可用；
      // getSystemPromptOptions 类型仅 ExtensionCommandContext 声明，但运行时普通 ctx 同样提供
      // （agent-session.js:1924 源码核实：getSystemPromptOptions: () => this._baseSystemPromptOptions）
      const ctx = requireCtxOf() as ExtensionContext & {
        getSystemPromptOptions?: () => BuildSystemPromptOptions;
      };
      const options = ctx.getSystemPromptOptions?.();
      const breakdown = computeContextBreakdown({
        customPrompt: options?.customPrompt ?? null,
        guidelines: options?.promptGuidelines ?? [],
        appendSystemPrompt: options?.appendSystemPrompt ?? null,
        contextFiles: options?.contextFiles ?? [],
        skills: options?.skills ?? [],
        toolSnippets: options?.toolSnippets ?? {},
        messages: contextMessagesFromEntries(ctx.sessionManager.buildContextEntries()),
      });
      const usage = ctx.getContextUsage();
      return {
        categories: breakdown.categories,
        conversation: breakdown.conversation,
        total: breakdown.total,
        usage: usage
          ? {
              tokens: usage.tokens,
              contextWindow: usage.contextWindow,
              percent: usage.percent == null ? null : usage.percent / 100,
            }
          : null,
      };
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
