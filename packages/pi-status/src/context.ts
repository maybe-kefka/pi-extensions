/**
 * Pure context-breakdown computation for the /status panel.
 * No pi runtime imports: message shapes are structural subsets of the real
 * AgentMessage types, so callers can pass `buildSessionContext().messages`
 * directly. All functions are unit-tested.
 */

export interface ChatMessageLike {
	role: string;
	content?: string | Array<{ type: string; text?: string; thinking?: string; name?: string; arguments?: unknown }>;
	summary?: string;
	command?: string;
	output?: string;
}

export interface SessionEntryLike {
	type: string;
	message?: ChatMessageLike;
	summary?: string;
}

/**
 * Project session entries (from buildContextEntries) into an LLM message view,
 * mirroring the subset of pi's buildSessionContext relevant to token estimation:
 * message entries pass through, compaction/branch summaries become summary
 * messages, everything else is skipped.
 */
export function contextMessagesFromEntries(entries: SessionEntryLike[]): ChatMessageLike[] {
	const messages: ChatMessageLike[] = [];
	for (const entry of entries) {
		if (entry.type === "message" && entry.message) {
			messages.push(entry.message);
		} else if (entry.type === "compaction" && entry.summary) {
			messages.push({ role: "compactionSummary", summary: entry.summary });
		} else if (entry.type === "branch_summary" && entry.summary) {
			messages.push({ role: "branchSummary", summary: entry.summary });
		}
	}
	return messages;
}

export interface ContextFileLike {
	path: string;
	content: string;
}

export interface SkillLike {
	name: string;
	description?: string;
}

export interface ContextBreakdownInput {
	customPrompt: string | null;
	guidelines: string[];
	appendSystemPrompt: string | null;
	contextFiles: ContextFileLike[];
	skills: SkillLike[];
	toolSnippets: Record<string, string>;
	messages: ChatMessageLike[];
}

export interface ConversationTokens {
	user: number;
	assistant: number;
	toolResult: number;
	other: number;
	total: number;
}

export interface ContextCategory {
	key: "system" | "contextFiles" | "skills" | "tools" | "conversation";
	label: string;
	tokens: number;
}

export interface ContextBreakdown {
	categories: ContextCategory[];
	conversation: ConversationTokens;
	total: number;
	/** Internal ratio (tokens / total) per category key. */
	ratios: Record<ContextCategory["key"], number>;
}

/** chars/4 heuristic, matching pi's own estimateTokens. Conservative (overestimates). */
export function estimateTextTokens(text: string): number {
	if (text.length === 0) return 0;
	return Math.ceil(text.length / 4);
}

const ESTIMATED_IMAGE_CHARS = 4800;

function contentChars(content: ChatMessageLike["content"]): number {
	if (typeof content === "string") return content.length;
	let chars = 0;
	for (const block of content ?? []) {
		if (block.type === "text" && block.text) chars += block.text.length;
		else if (block.type === "image") chars += ESTIMATED_IMAGE_CHARS;
	}
	return chars;
}

/** Estimate token count for a single message using the chars/4 heuristic. */
export function estimateMessageTokens(message: ChatMessageLike): number {
	let chars = 0;
	switch (message.role) {
		case "user":
		case "toolResult":
		case "custom":
			chars = contentChars(message.content);
			break;
		case "assistant": {
			for (const block of (message.content as Array<{ type: string; text?: string; thinking?: string; name?: string; arguments?: unknown }>) ?? []) {
				if (block.type === "text" && block.text) chars += block.text.length;
				else if (block.type === "thinking" && block.thinking) chars += block.thinking.length;
				else if (block.type === "toolCall") {
					chars += (block.name ?? "").length + JSON.stringify(block.arguments ?? {}).length;
				}
			}
			break;
		}
		case "bashExecution":
			chars = (message.command ?? "").length + (message.output ?? "").length;
			break;
		case "branchSummary":
		case "compactionSummary":
			chars = (message.summary ?? "").length;
			break;
		default:
			return 0;
	}
	return Math.ceil(chars / 4);
}

const CATEGORY_LABELS: Record<ContextCategory["key"], string> = {
	system: "系统提示词",
	contextFiles: "上下文文件",
	skills: "技能",
	tools: "工具定义",
	conversation: "对话消息",
};

/** Compute the five-category context breakdown from raw inputs. */
export function computeContextBreakdown(input: ContextBreakdownInput): ContextBreakdown {
	const systemText = [
		input.customPrompt ?? "",
		input.guidelines.join("\n"),
		input.appendSystemPrompt ?? "",
	].join("");
	const system = estimateTextTokens(systemText);

	const contextFiles = input.contextFiles.reduce(
		(sum, f) => sum + estimateTextTokens(`${f.path}\n${f.content}`),
		0,
	);

	const skills = input.skills.reduce(
		(sum, s) => sum + estimateTextTokens(`${s.name} ${s.description ?? ""}`.trim()),
		0,
	);

	const tools = Object.values(input.toolSnippets).reduce((sum, v) => sum + estimateTextTokens(v), 0);

	const conversation: ConversationTokens = { user: 0, assistant: 0, toolResult: 0, other: 0, total: 0 };
	for (const message of input.messages) {
		const tokens = estimateMessageTokens(message);
		conversation.total += tokens;
		switch (message.role) {
			case "user":
				conversation.user += tokens;
				break;
			case "assistant":
				conversation.assistant += tokens;
				break;
			case "toolResult":
			case "bashExecution":
				conversation.toolResult += tokens;
				break;
			default:
				conversation.other += tokens;
				break;
		}
	}

	const categories: ContextCategory[] = [
		{ key: "system", label: CATEGORY_LABELS.system, tokens: system },
		{ key: "contextFiles", label: CATEGORY_LABELS.contextFiles, tokens: contextFiles },
		{ key: "skills", label: CATEGORY_LABELS.skills, tokens: skills },
		{ key: "tools", label: CATEGORY_LABELS.tools, tokens: tools },
		{ key: "conversation", label: CATEGORY_LABELS.conversation, tokens: conversation.total },
	];

	const total = categories.reduce((sum, c) => sum + c.tokens, 0);

	const ratios: Record<ContextCategory["key"], number> = {
		system: 0,
		contextFiles: 0,
		skills: 0,
		tools: 0,
		conversation: 0,
	};
	if (total > 0) {
		for (const c of categories) ratios[c.key] = c.tokens / total;
	}

	return { categories, conversation, total, ratios };
}
