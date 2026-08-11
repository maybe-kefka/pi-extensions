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
  type SessionEntryLike as BreakdownEntryLike,
} from "../domain/context-breakdown.js";
import { expandSkillChips, skillLookupFrom } from "../domain/skill-expand.js";
import { resolveCloseAgent } from "../domain/orchestrate.js";
import { askRegistry } from "../domain/web-ask.js";
import { readFileSync } from "node:fs";
import { listFiles } from "../domain/file-lister.js";
import { resolveUserEntryId } from "../domain/fork-util.js";
import { truncateTree } from "../domain/tree.js";
import { deleteSessionFile } from "../infrastructure/session-files.js";
import { realFs } from "../infrastructure/real-fs.js";
import { createGitRunner } from "../infrastructure/git-runner.js";
import { countPath, deletePath, listDir, mkdirPath, readFileText, renamePath, touchPath, writeFileText } from "../domain/files.js";
import { createBranch as createBranchOp, createBranchFrom, switchOrTrack } from "../domain/git.js";
import {
  aggregateStatus,
  assertRepoRoot,
  commitChanges,
  deleteBranch,
  discoverRepos,
  fileDiff,
  listBranches,
  mergeBranch,
  stageFiles,
  stashOp,
  unstageFiles,
  parsePorcelain,
  pullBranch,
  pushBranch,
  rebaseBranch,
  repoBrief,
  showHeadFile,
  repoInfo,
  switchBranch,
} from "../domain/git.js";
import { parseSessionJsonl, readSessionHistory, parseSessionEntries, type SessionEntryLike } from "../domain/session-history.js";
import { THINKING_LEVELS, SessionManager, type BuildSystemPromptOptions, type WebConsole } from "../application/web-console.js";

/**
 * 会话树最大序列化深度。bun（JSC）实测 JSON.stringify 约 20 万层才爆栈；
 * 正常线性会话每轮 2 条消息（user+assistant），2000 覆盖 1000 轮对话且留 100 倍裕度。
 */
const TREE_MAX_DEPTH = 2000;

export function registerRpcHandler(console: WebConsole): void {
  console.handleRequest = (id, method, params) => handleRequest(console, id, method, params);
}

/** 多仓库：repoRoot 白名单校验后返回 git runner（默认 cwd） */
async function gitRunnerFor(
  ctx: ExtensionContext,
  params: Record<string, unknown>,
): Promise<ReturnType<typeof createGitRunner>> {
  const repoRoot = typeof params.repoRoot === "string" ? params.repoRoot : undefined;
  const check = await assertRepoRoot(ctx.cwd, repoRoot, realFs);
  if (!check.ok) throw new WebServerError(-32603, check.error);
  return createGitRunner(check.root);
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
    case "web-ask:answer": {
      // R25：web 提问工具回答通道——resolve 阻塞中的 execute（未找到/已终结 → 报错）
      // multi-instance：回答按 processId 路由（host 本地 registry；spawned/external 经 WS 下行）
      const toolCallId = params.toolCallId;
      if (typeof toolCallId !== "string" || toolCallId === "") {
        throw new WebServerError(-32602, "toolCallId 必须是非空字符串");
      }
      const processId = typeof params.processId === "string" ? params.processId : "host";
      if (processId !== "host") {
        try {
          console.sendToProcess(processId, "ask-answer", { toolCallId, answer: params.answer });
          return { ok: true };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          throw new WebServerError(1, message);
        }
      }
      if (!askRegistry.answer(toolCallId, params.answer)) {
        throw new WebServerError(-32602, `未找到对应的提问（toolCallId=${toolCallId}，可能已超时/取消/已回答）`);
      }
      return { ok: true };
    }

    case "pi:agentList": {
      // multi-instance：注册进程列表（chat tab 数据源）
      return { agents: console.agentList() };
    }

    case "pi:chatSend": {
      // multi-instance：向指定进程发送（host 本地 / agent WS 下行）
      const processId = typeof params.processId === "string" ? params.processId : "";
      const text = typeof params.text === "string" ? params.text : "";
      if (processId === "" || text.trim() === "") throw new WebServerError(-32602, "processId/text 必填");
      try {
        console.sendToProcess(processId, "send", { text: text.trim(), deliverAs: params.deliverAs });
        return { ok: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes("Agent is already processing")) {
          throw new WebServerError(2, `agent 正在处理，请指定 deliverAs（"steer" 打断 / "followUp" 排队）`);
        }
        throw new WebServerError(1, message);
      }
    }

    case "pi:closeAgent": {
      // 关 tab 释放实例：spawned → 杀；external（TUI 注册者）→ 保留注册
      const processId = typeof params.processId === "string" ? params.processId : "";
      if (processId === "") throw new WebServerError(-32602, "processId 必填");
      const entry = console.agentList().find((ag) => ag.processId === processId) ?? null;
      if (resolveCloseAgent(entry) === "kill") console.killAgent(processId);
      return { ok: true };
    }

    case "pi:chatAbort": {
      const processId = typeof params.processId === "string" ? params.processId : "";
      if (processId === "") throw new WebServerError(-32602, "processId 必填");
      console.sendToProcess(processId, "abort", {});
      return { ok: true };
    }

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
      // 实例 compact：processId 非空 → 下行（压缩对应注册者的上下文）
      const processId = typeof params.processId === "string" ? params.processId : "";
      if (processId !== "") {
        try {
          console.sendToProcess(processId, "compact", {});
          return null;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          throw new WebServerError(1, message);
        }
      }
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

    case "pi:openSession": {
      // 会话实例化：打开历史会话 → spawn 独立实例（幂等——已有实例直接返回）
      const path = params.path;
      if (typeof path !== "string" || path === "") throw new WebServerError(-32602, "path 必填");
      const processId = await console.spawnSessionInstance(path, console.agentHostUrl() ?? console.url ?? "");
      return { processId };
    }

    case "pi:newChatSession": {
      // 新建会话：spawn 独立实例（--session-id 创建）——与打开历史会话同路径
      const processId = await console.spawnNewSession(console.agentHostUrl() ?? console.url ?? "");
      return { processId };
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
      // R27：树深超过 serialize 递归极限会 RangeError 杀死进程——截断到安全深度
      return { tree: truncateTree(ctx.sessionManager.getTree(), TREE_MAX_DEPTH), leafId: ctx.sessionManager.getLeafId() ?? null };
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
      // 实例对话：processId 非空 → 读该实例的 session jsonl（chat tab 弹窗显示当前 tab 的对话统计）
      let conversation: ConversationTokens;
      const processId = typeof params.processId === "string" ? params.processId : "";
      if (processId !== "") {
        const entry = console.agentList().find((ag) => ag.processId === processId);
        const sessionFile = entry?.sessionFile ?? null;
        if (sessionFile) {
          try {
            // 实例 jsonl 可能尚未创建（无消息）——优雅降级为对话 0；
            // 原始 entries（type/message 结构）直接喂 contextMessagesFromEntries（勿经 parseSessionEntries——结构不符）
            const raw = parseSessionJsonl(readFileSync(sessionFile, "utf8"));
            conversation = computeConversationTokens(contextMessagesFromEntries(raw as unknown as BreakdownEntryLike[]));
          } catch {
            conversation = computeConversationTokens([]);
          }
        } else {
          conversation = computeConversationTokens([]);
        }
      } else {
        const messages = contextMessagesFromEntries(ctx.sessionManager.buildContextEntries());
        conversation = computeConversationTokens(messages);
      }
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

    case "pi:listDir": {
      // files 迭代：单目录列举（按需展开），路径白名单由安全域校验
      const ctx = requireCtxOf();
      const relPath = typeof params.path === "string" ? params.path : "";
      const entries = await listDir(ctx.cwd, relPath, realFs);
      if (entries === null) {
        throw new WebServerError(-32602, `目录不存在或越权：${relPath || "(根)"}`);
      }
      return { entries };
    }

    case "pi:readFile": {
      const ctx = requireCtxOf();
      const relPath = typeof params.path === "string" ? params.path : "";
      const result = await readFileText(ctx.cwd, relPath, realFs);
      if (result === null) {
        throw new WebServerError(-32602, `文件不存在或越权：${relPath}`);
      }
      return result;
    }

    case "pi:writeFile": {
      // files 迭代：带快照冲突检测的写入（expected 来自客户端打开/保存时的快照）
      const ctx = requireCtxOf();
      const relPath = typeof params.path === "string" ? params.path : "";
      const content = typeof params.content === "string" ? params.content : "";
      const expectedHash = typeof params.expectedHash === "string" ? params.expectedHash : null;
      const expectedMtimeMs = typeof params.expectedMtimeMs === "number" ? params.expectedMtimeMs : null;
      const result = await writeFileText(
        ctx.cwd,
        relPath,
        content,
        { hash: expectedHash, mtimeMs: expectedMtimeMs },
        realFs,
      );
      if (result.ok) return { ok: true };
      return { ok: false, reason: result.reason, current: result.current ?? undefined };
    }

    case "pi:gitRepos": {
      // git-multi-repo：发现 cwd 下全部 git 仓库 + brief 信息
      const ctx = requireCtxOf();
      const roots = await discoverRepos(ctx.cwd, realFs);
      const repos = await Promise.all(
        roots.map(async (root) => {
          const git = createGitRunner(root);
          const brief = await repoBrief(root, git);
          const rel = root === ctx.cwd ? "" : root.slice(ctx.cwd.length + 1);
          return { root: rel, name: rel || root.split("/").pop() || "root", ...brief };
        }),
      );
      return { repos };
    }

    case "pi:gitInfo": {
      // files 迭代：repo 根/分支/worktree 标记（只读 rev-parse 查询）
      const ctx = requireCtxOf();
      return repoInfo(ctx.cwd, createGitRunner(ctx.cwd));
    }

    case "pi:mkdir": {
      // files 迭代：新建目录（单级名字，路径白名单）
      const ctx = requireCtxOf();
      const relPath = typeof params.path === "string" ? params.path : "";
      const result = await mkdirPath(ctx.cwd, relPath, realFs);
      if (!result.ok) throw new WebServerError(-32602, `新建目录失败：${result.reason}`);
      return { ok: true };
    }

    case "pi:touch": {
      // files 迭代：新建空文件（路径白名单）
      const ctx = requireCtxOf();
      const relPath = typeof params.path === "string" ? params.path : "";
      const result = await touchPath(ctx.cwd, relPath, realFs);
      if (!result.ok) throw new WebServerError(-32602, `新建文件失败：${result.reason}`);
      return { ok: true };
    }

    case "pi:rename": {
      const ctx = requireCtxOf();
      const relPath = typeof params.path === "string" ? params.path : "";
      const newName = typeof params.newName === "string" ? params.newName : "";
      const result = await renamePath(ctx.cwd, relPath, newName, realFs);
      if (!result.ok) throw new WebServerError(-32602, `重命名失败：${result.reason}`);
      return { ok: true };
    }

    case "pi:countTree": {
      // git-multi-repo review：删除确认前统计项数
      const ctx = requireCtxOf();
      const relPath = typeof params.path === "string" ? params.path : "";
      const count = await countPath(ctx.cwd, relPath, realFs);
      if (count === null) throw new WebServerError(-32602, `路径不存在或越权：${relPath}`);
      return { count };
    }

    case "pi:delete": {
      const ctx = requireCtxOf();
      const relPath = typeof params.path === "string" ? params.path : "";
      const result = await deletePath(ctx.cwd, relPath, realFs);
      if (!result.ok) throw new WebServerError(-32602, `删除失败：${result.reason}`);
      return result;
    }

    case "pi:gitStatus": {
      // files 迭代：porcelain 全量解析 + 目录聚合（树状态标记）
      const ctx = requireCtxOf();
      const git = await gitRunnerFor(ctx, params);
      const probe = await git(["rev-parse", "--is-inside-work-tree"]);
      if (probe.code !== 0 || probe.stdout.trim() !== "true") {
        return { isRepo: false, entries: [] };
      }
      const r = await git(["status", "--porcelain=v1", "--no-renames"]);
      const entries = parsePorcelain(r.stdout);
      const aggregated = aggregateStatus(entries);
      return { isRepo: true, entries, aggregated: Object.fromEntries(aggregated) };
    }

    case "pi:gitBranches": {
      // vscode-align 05a：分支列表
      const ctx = requireCtxOf();
      const git = await gitRunnerFor(ctx, params);
      const r = await listBranches(ctx.cwd, git);
      if (r.branches.length === 0 && !r.current) {
        const probe = await git(["rev-parse", "--is-inside-work-tree"]);
        if (probe.code !== 0) return { isRepo: false };
      }
      return { isRepo: true, current: r.current, branches: r.branches, remotes: r.remotes };
    }

    case "pi:gitSwitch": {
      const ctx = requireCtxOf();
      const branch = typeof params.branch === "string" ? params.branch : "";
      if (branch === "") throw new WebServerError(-32602, "branch 必填");
      const r = await switchBranch(ctx.cwd, branch, await gitRunnerFor(ctx, params));
      if (!r.ok) throw new WebServerError(-32603, r.error);
      return { ok: true };
    }

    case "pi:gitSwitchRemote": {
      // git-panel-polish：点远程分支 → 创建跟踪分支并切换（本地同名直接切）
      const ctx = requireCtxOf();
      const remote = typeof params.remote === "string" ? params.remote : "";
      if (remote === "") throw new WebServerError(-32602, "remote 必填");
      const r = await switchOrTrack(ctx.cwd, remote, await gitRunnerFor(ctx, params));
      if (!r.ok) throw new WebServerError(-32603, r.error);
      return { ok: true };
    }

    case "pi:gitBranchCreate": {
      const ctx = requireCtxOf();
      const name = typeof params.name === "string" ? params.name : "";
      if (name === "") throw new WebServerError(-32602, "name 必填");
      const r = await createBranchOp(ctx.cwd, name, await gitRunnerFor(ctx, params));
      if (!r.ok) throw new WebServerError(-32603, r.error);
      return { ok: true };
    }

    case "pi:gitCreateBranch": {
      // git-panel-polish：从 base 创建并立即切换（分支选择弹窗）
      const ctx = requireCtxOf();
      const name = typeof params.name === "string" ? params.name : "";
      const base = typeof params.base === "string" ? params.base : "";
      if (name === "" || base === "") throw new WebServerError(-32602, "name/base 必填");
      if (name.startsWith("-") || base.startsWith("-")) throw new WebServerError(-32602, "非法名称");
      const r = await createBranchFrom(ctx.cwd, name, base, await gitRunnerFor(ctx, params));
      if (!r.ok) throw new WebServerError(-32603, r.error);
      return { ok: true };
    }

    case "pi:gitBranchDelete": {
      const ctx = requireCtxOf();
      const branch = typeof params.branch === "string" ? params.branch : "";
      const r = await deleteBranch(ctx.cwd, branch, await gitRunnerFor(ctx, params));
      if (!r.ok) throw new WebServerError(-32603, r.error);
      return { ok: true };
    }

    case "pi:gitMerge": {
      const ctx = requireCtxOf();
      const branch = typeof params.branch === "string" ? params.branch : "";
      const r = await mergeBranch(ctx.cwd, branch, await gitRunnerFor(ctx, params));
      if (!r.ok) throw new WebServerError(-32603, r.error);
      return { ok: true };
    }

    case "pi:gitRebase": {
      const ctx = requireCtxOf();
      const branch = typeof params.branch === "string" ? params.branch : "";
      const r = await rebaseBranch(ctx.cwd, branch, await gitRunnerFor(ctx, params));
      if (!r.ok) throw new WebServerError(-32603, r.error);
      return { ok: true };
    }

    case "pi:gitStage": {
      // vscode-align 05b：暂存（单文件或全部）
      const ctx = requireCtxOf();
      const path = typeof params.path === "string" ? params.path : null;
      const res = await stageFiles(ctx.cwd, path ? [path] : ["."], await gitRunnerFor(ctx, params));
      if (!res.ok) throw new WebServerError(-32603, res.error);
      return { ok: true };
    }

    case "pi:gitUnstage": {
      const ctx = requireCtxOf();
      const path = typeof params.path === "string" ? params.path : null;
      const res = await unstageFiles(ctx.cwd, path ? [path] : ["."], await gitRunnerFor(ctx, params));
      if (!res.ok) throw new WebServerError(-32603, res.error);
      return { ok: true };
    }

    case "pi:gitCommit": {
      const ctx = requireCtxOf();
      const message = typeof params.message === "string" ? params.message : "";
      const res = await commitChanges(ctx.cwd, message, await gitRunnerFor(ctx, params));
      if (!res.ok) throw new WebServerError(-32603, res.error);
      return { ok: true };
    }

    case "pi:gitPush": {
      // vscode-align 05c：推送当前分支（--force 已被白名单拒绝）
      const ctx = requireCtxOf();
      const res = await pushBranch(ctx.cwd, await gitRunnerFor(ctx, params));
      if (!res.ok) throw new WebServerError(-32603, res.error);
      return { ok: true };
    }

    case "pi:gitPull": {
      const ctx = requireCtxOf();
      const res = await pullBranch(ctx.cwd, await gitRunnerFor(ctx, params));
      if (!res.ok) throw new WebServerError(-32603, res.error);
      return { ok: true };
    }

    case "pi:gitStash": {
      const ctx = requireCtxOf();
      const action = typeof params.action === "string" ? params.action : "push";
      const message = typeof params.message === "string" ? params.message : undefined;
      if (action !== "push" && action !== "pop" && action !== "apply" && action !== "drop") {
        throw new WebServerError(-32602, `未知 stash 动作：${action}`);
      }
      const res = await stashOp(ctx.cwd, action, message, await gitRunnerFor(ctx, params));
      if (!res.ok) throw new WebServerError(-32603, res.error);
      return { ok: true };
    }

    case "pi:gitShowHead": {
      // git-multi-repo 06：HEAD 版本文件内容（只读 diff 左栏）
      const ctx = requireCtxOf();
      const relPath = typeof params.path === "string" ? params.path : "";
      const res = await showHeadFile(ctx.cwd, relPath, await gitRunnerFor(ctx, params));
      if (!res.ok) throw new WebServerError(-32603, res.error);
      return { content: res.content };
    }

    case "pi:gitDiff": {
      // files 迭代：单文件 vs HEAD diff（只读白名单内）
      const ctx = requireCtxOf();
      const relPath = typeof params.path === "string" ? params.path : "";
      return fileDiff(ctx.cwd, relPath, await gitRunnerFor(ctx, params));
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

        case "pi:getMessages": {
      const ctx = requireCtxOf();
      return { messages: parseSessionEntries(ctx.sessionManager.getEntries() as SessionEntryLike[]) };
    }

    case "pi:chatHistory": {
      // multi-instance：按进程注册的 sessionFile 读历史
      const processId = typeof params.processId === "string" ? params.processId : "";
      if (processId === "") throw new WebServerError(-32602, "processId 必填");
      const entry = console.agentList().find((a) => a.processId === processId);
      if (!entry || !entry.sessionFile) throw new WebServerError(1, `进程无会话文件：${processId}`);
      const messages = readSessionHistory(entry.sessionFile, (p) => readFileSync(p, "utf8"));
      if (messages === null) throw new WebServerError(1, `会话文件不可读：${entry.sessionFile}`);
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
  // total = 全部分类之和（contextFiles/skills/tools 也计入——否则系统提示词占比虚高为 100%）
  const total = parts.system + parts.contextFiles + parts.skills + parts.tools + parts.conversation.total;
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

