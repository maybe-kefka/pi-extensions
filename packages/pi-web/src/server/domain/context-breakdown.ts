/**
 * 上下文占用分类估算（纯函数，TDD）。
 * 与 pi-status 同款逻辑（chars/4 启发式，保守高估），供 web 端上下文面板使用。
 * 无 pi runtime 导入：消息结构是真实 AgentMessage 的结构子集。
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
  content?: ChatMessageLike["content"];
}

/**
 * 将会话条目投影为 LLM 消息视图（与 buildSessionContext 的子集一致）：
 * message 条目透传，compaction/branch 摘要成为摘要消息，custom_message 成为 role "custom"
 * （参与 LLM 上下文）；plain custom 条目（appendEntry，如状态快照）跳过——从不进入上下文。
 */
export function contextMessagesFromEntries(entries: SessionEntryLike[]): ChatMessageLike[] {
  const messages: ChatMessageLike[] = [];
  for (const entry of entries) {
    if (entry.type === "message" && entry.message) {
      messages.push(entry.message);
    } else if (entry.type === "custom_message" && entry.content) {
      messages.push({ role: "custom", content: entry.content });
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
  /** 每类在总估算中的比例（tokens / total）。 */
  ratios: Record<ContextCategory["key"], number>;
}

/** chars/4 启发式，与 pi 自身 estimateTokens 一致。保守（高估）。 */
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

/** 估算单条消息 token（chars/4）。 */
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

/**
 * R20 降级路径：从完整系统提示词文本解析三类明细（token 估算）。
 * 依赖 pi 提示词模板结构（0.84.1 实测稳定）；任一段缺失 → 该分类 0（优雅降级，不抛错）。
 */
export function parseSystemPromptSections(systemPrompt: string): {
  contextFiles: number;
  tools: number;
  skills: number;
} {
  // contextFiles：<project_instructions path="...">...</project_instructions> 段（含 path）
  let contextFiles = 0;
  const fileRe = /<project_instructions\s+path="([^"]*)">([\s\S]*?)<\/project_instructions>/g;
  let m: RegExpExecArray | null;
  while ((m = fileRe.exec(systemPrompt)) !== null) {
    contextFiles += estimateTextTokens(`${m[1]}\n${m[2]}`);
  }

  // tools：Available tools: 到 Guidelines: 之间的 "- name: snippet" 行
  let tools = 0;
  const toolsSection = systemPrompt.match(/Available tools:\n([\s\S]*?)\nGuidelines:/);
  if (toolsSection) {
    for (const line of toolsSection[1].split("\n")) {
      const t = line.match(/^-\s*(\S+):\s*(.*)$/);
      if (t) tools += estimateTextTokens(`${t[1]}: ${t[2]}`);
    }
  }

  // skills：<available_skills> 段
  let skills = 0;
  const skillsSection = systemPrompt.match(/<available_skills>([\s\S]*?)<\/available_skills>/);
  if (skillsSection) skills = estimateTextTokens(skillsSection[1]);

  return { contextFiles, tools, skills };
}

/** 从消息列表计算对话分类 token（computeContextBreakdown 与 R20 rpc-handler 共用） */
export function computeConversationTokens(messages: ChatMessageLike[]): ConversationTokens {
  const conversation: ConversationTokens = { user: 0, assistant: 0, toolResult: 0, other: 0, total: 0 };
  for (const message of messages) {
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
  return conversation;
}

/** 从原始输入计算五类上下文占用。 */
export function computeContextBreakdown(input: ContextBreakdownInput): ContextBreakdown {
  const systemText = [input.customPrompt ?? "", input.guidelines.join("\n"), input.appendSystemPrompt ?? ""].join("");
  const system = estimateTextTokens(systemText);

  const contextFiles = input.contextFiles.reduce((sum, f) => sum + estimateTextTokens(`${f.path}\n${f.content}`), 0);

  const skills = input.skills.reduce((sum, s) => sum + estimateTextTokens(`${s.name} ${s.description ?? ""}`.trim()), 0);

  const tools = Object.values(input.toolSnippets).reduce((sum, v) => sum + estimateTextTokens(v), 0);

  const conversation = computeConversationTokens(input.messages);

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
