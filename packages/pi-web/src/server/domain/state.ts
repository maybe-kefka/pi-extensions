/**
 * 状态快照构造（纯函数）。
 * SPEC §8：percent 0-100 → 0-1 归一化；缺省 → null。
 */

export interface ContextUsageLike {
  tokens: number | null;
  contextWindow: number | null;
  /** 0-100 百分数 */
  percent: number | null;
}

export interface ModelLike {
  provider: string;
  id: string;
  name?: string | null;
  reasoning?: boolean;
  thinkingLevelMap?: Record<string, string | null> | null;
}

export interface StateInput {
  sessionFile: string | null;
  sessionId: string | null;
  sessionName: string | undefined;
  model: ModelLike | null;
  thinkingLevel: string | null;
  isStreaming: boolean;
  contextUsage: ContextUsageLike | null;
  messageCount: number;
  /** 全部可枚举等级（过滤前的全集） */
  allThinkingLevels: string[];
}

export interface WebState {
  sessionFile: string | null;
  sessionId: string | null;
  sessionName: string | null;
  model: { provider: string; id: string; name: string | null } | null;
  thinkingLevel: string | null;
  /** 当前模型实际支持的思考等级（随 model_select 刷新） */
  availableThinkingLevels: string[];
  isStreaming: boolean;
  context: { tokens: number | null; contextWindow: number | null; percent: number | null };
  messageCount: number;
}

/** 0-100 百分数 → 0-1 比例；非有限值 → null；clamp [0,1] */
export function normalizePercent(percent: number | null): number | null {
  if (percent === null || !Number.isFinite(percent)) return null;
  return Math.max(0, Math.min(1, percent / 100));
}

/**
 * 当前模型支持的思考等级（与 pi 内部 getSupportedThinkingLevels 同口径）：
 * - 无模型 → 全集（无法判定，交给前端兜底）
 * - 非 reasoning 模型 → ["off"]
 * - 按 thinkingLevelMap 过滤：null 标记不支持；xhigh/max 仅显式声明可用
 */
export function supportedThinkingLevels(model: ModelLike | null, allLevels: string[]): string[] {
  if (!model) return allLevels;
  if (model.reasoning === false) return ["off"];
  return allLevels.filter((level) => {
    const mapped = model.thinkingLevelMap?.[level];
    if (mapped === null) return false;
    if (level === "xhigh" || level === "max") return mapped !== undefined;
    return true;
  });
}

export function buildState(input: StateInput): WebState {
  const ctx = input.contextUsage;
  return {
    sessionFile: input.sessionFile,
    sessionId: input.sessionId,
    sessionName: input.sessionName ?? null,
    model: input.model
      ? { provider: input.model.provider, id: input.model.id, name: input.model.name ?? null }
      : null,
    thinkingLevel: input.thinkingLevel,
    availableThinkingLevels: supportedThinkingLevels(input.model, input.allThinkingLevels),
    isStreaming: input.isStreaming,
    context: {
      tokens: ctx?.tokens ?? null,
      contextWindow: ctx?.contextWindow ?? null,
      percent: normalizePercent(ctx?.percent ?? null),
    },
    messageCount: input.messageCount,
  };
}
