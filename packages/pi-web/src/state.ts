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
}

export interface WebState {
  sessionFile: string | null;
  sessionId: string | null;
  sessionName: string | null;
  model: { provider: string; id: string; name: string | null } | null;
  thinkingLevel: string | null;
  isStreaming: boolean;
  context: { tokens: number | null; contextWindow: number | null; percent: number | null };
  messageCount: number;
}

/** 0-100 百分数 → 0-1 比例；非有限值 → null；clamp [0,1] */
export function normalizePercent(percent: number | null): number | null {
  if (percent === null || !Number.isFinite(percent)) return null;
  return Math.max(0, Math.min(1, percent / 100));
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
    isStreaming: input.isStreaming,
    context: {
      tokens: ctx?.tokens ?? null,
      contextWindow: ctx?.contextWindow ?? null,
      percent: normalizePercent(ctx?.percent ?? null),
    },
    messageCount: input.messageCount,
  };
}
