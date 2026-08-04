/** pending ask 状态机（纯函数，TDD：test/ask.test.ts）。
 *  状态变更函数（resolveAsk/cancelAsk/checkTimeout）自行写回 ask.result；
 *  幂等：已终结（result 非空）的 ask 再次调用 → null（调用方忽略）。 */

export interface Ask {
  id: string;
  question: string;
  /** 毫秒时间戳；null = 永不超时（timeoutMs=0） */
  deadline: number | null;
  result: AskResult | null;
}

/** 终结状态（供文案/反馈逻辑复用） */
export type TerminalStatus = "answered" | "timeout";

export type AskResult =
  | { status: "answered"; selection: number | null; option: string | null; text: string }
  | { status: "timeout" }
  | { status: "cancelled" };

/** 回复/取消/超时均直接写入 ask.result（调用方无需回写）；已终结再调用返回 null */
export interface ReplyInput {
  selection?: number | null;
  option?: string | null;
  text?: string | null;
}

export function createAsk(input: {
  id: string;
  question: string;
  timeoutMs: number;
  now: number;
}): Ask {
  return {
    id: input.id,
    question: input.question,
    deadline: input.timeoutMs > 0 ? input.now + input.timeoutMs : null,
    result: null,
  };
}

/** 回复 → answered；已终结 → null */
export function resolveAsk(
  ask: Ask,
  reply: ReplyInput,
  _now: number,
): AskResult | null {
  if (ask.result !== null) return null;
  const selection = reply.selection ?? null;
  const option = reply.option ?? null;
  const text = reply.text ?? "";
  const result: AskResult = { status: "answered", selection, option, text };
  ask.result = result;
  return result;
}

/** 取消（滑掉通知）→ cancelled；已终结 → null */
export function cancelAsk(ask: Ask, _now: number): AskResult | null {
  if (ask.result !== null) return null;
  const result: AskResult = { status: "cancelled" };
  ask.result = result;
  return result;
}

/** 超时检查：到点且未终结 → timeout（幂等，重复检查稳定返回同一结果）；否则 null */
export function checkTimeout(ask: Ask, now: number): AskResult | null {
  if (ask.result !== null) {
    return ask.result.status === "timeout" ? ask.result : null;
  }
  if (ask.deadline === null) return null;
  if (now < ask.deadline) return null;
  const result: AskResult = { status: "timeout" };
  ask.result = result;
  return result;
}

/** 结果 → LLM 可见结构（question 回显，SPEC §5.2） */
export function serializeResult(
  result: AskResult,
  question: string,
): Record<string, unknown> {
  const base: Record<string, unknown> = { status: result.status, question };
  if (result.status === "answered") {
    base.selection = result.selection;
    base.option = result.option;
    base.text = result.text;
  }
  return base;
}
