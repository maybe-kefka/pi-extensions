/**
 * R25：web 提问工具（web_ask_*）——服务器领域层（纯逻辑，可单测）。
 *
 * 模式照 pi-notify-termux 的 ask 工具：execute 阻塞等待用户回答
 * （pi 内核串行 await 工具结果，LLM 自动暂停）；回答经 RPC web-ask:answer
 * resolve；超时（默认 10 分钟）与 abort（agent 中止）兜底。
 */

export type AskResult =
  | { status: "answered"; answer: unknown }
  | { status: "timeout" }
  | { status: "cancelled" };

export const ASK_TIMEOUT_MS = 10 * 60 * 1000;

export interface PendingAsk {
  resolve: (result: AskResult) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface AskRegistry {
  readonly pendingCount: number;
  register(toolCallId: string, resolve: (result: AskResult) => void): void;
  /** 幂等：已终结（超时/取消/已回答）返回 false */
  answer(toolCallId: string, answer: unknown): boolean;
  /** 幂等：已终结返回 false */
  abort(toolCallId: string): boolean;
}

export function createAskRegistry(timeoutMs: number = ASK_TIMEOUT_MS): AskRegistry {
  const pending = new Map<string, PendingAsk>();
  return {
    get pendingCount() {
      return pending.size;
    },
    register(toolCallId: string, resolve: (result: AskResult) => void): void {
      const timer = setTimeout(() => {
        if (pending.delete(toolCallId)) resolve({ status: "timeout" });
      }, timeoutMs);
      pending.set(toolCallId, { resolve, timer });
    },
    answer(toolCallId: string, answer: unknown): boolean {
      const p = pending.get(toolCallId);
      if (!p) return false;
      pending.delete(toolCallId);
      clearTimeout(p.timer);
      p.resolve({ status: "answered", answer });
      return true;
    },
    abort(toolCallId: string): boolean {
      const p = pending.get(toolCallId);
      if (!p) return false;
      pending.delete(toolCallId);
      clearTimeout(p.timer);
      p.resolve({ status: "cancelled" });
      return true;
    },
  };
}

/** 进程级单例：index.ts（registerTool execute）与 rpc-handler.ts（web-ask:answer）共用 */
export const askRegistry: AskRegistry = createAskRegistry();

/**
 * 工具结果 → LLM/对话流文本：友好格式（用户选择后的选项直读，而非 raw JSON）。
 * - answered：single → 「你选择了：X」；multi → 「你选择了：A、B」；text → 「你的回答：...」
 * - timeout：超时兜底（LLM 自行决定）；cancelled：工具被中止
 */
export function serializeAskResult(result: AskResult): string {
  switch (result.status) {
    case "answered": {
      const a = result.answer;
      const label = Array.isArray(a) ? a.map((x) => String(x)).join("、") : String(a);
      return `✅ 用户已回答。
你的选择：${label}`;
    }
    case "timeout":
      return "⏱️ 用户未在 10 分钟内回答（web 提问超时）。请自行决定，不要再等用户。";
    case "cancelled":
      return "❌ web 提问被中止（工具已取消）。请停止等待并继续当前任务。";
  }
}

/**
 * execute 等待体：注册 pending → 等回答/超时/中止 → 返回给 LLM 的文本结果。
 * （registerTool 的 execute 中调用；signal 为内核传入的 AbortSignal）
 */
export function askAndWait(
  registry: AskRegistry,
  toolCallId: string,
  signal: AbortSignal | undefined,
): Promise<{ content: Array<{ type: "text"; text: string }>; details: AskResult }> {
  return new Promise((resolve) => {
    registry.register(toolCallId, (result) => {
      resolve({ content: [{ type: "text", text: serializeAskResult(result) }], details: result });
    });
    signal?.addEventListener("abort", () => registry.abort(toolCallId), { once: true });
  });
}

/** 每轮系统提示引导（before_agent_start 注入）——引导 LLM 提问时优先使用 web_ask_* */
export const WEB_ASK_GUIDELINES = [
  "当你需要用户澄清、做决定或补充信息时，优先使用 web 提问工具询问用户，而不是猜测或擅自继续：",
  "- web_ask_single：有限选项单选（2-6 个选项）",
  "- web_ask_multi：多选（1-8 个选项，可限制最多选择数）",
  "- web_ask_text：自由文本输入（短回答）",
  "调用后工具会阻塞等待用户回答，回答会自动回到你的上下文。仅在 web 控制台不可用时才退化为自行决策。",
].join("\n");
