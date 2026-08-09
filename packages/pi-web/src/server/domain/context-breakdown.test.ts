import { describe, expect, it } from "vitest";
import {
  computeContextBreakdown,
  contextMessagesFromEntries,
  estimateMessageTokens,
  estimateTextTokens,
  parseSystemPromptSections,
  type ChatMessageLike,
  type ContextBreakdownInput,
} from "./context-breakdown.js";

describe("estimateTextTokens", () => {
  it("uses ceil(chars/4)", () => {
    expect(estimateTextTokens("")).toBe(0);
    expect(estimateTextTokens("abcd")).toBe(1);
    expect(estimateTextTokens("abcde")).toBe(2);
    expect(estimateTextTokens("abcdefgh")).toBe(2);
  });
});

describe("estimateMessageTokens", () => {
  it("counts user string content", () => {
    expect(estimateMessageTokens({ role: "user", content: "abcdefgh" })).toBe(2);
  });

  it("counts user image blocks as 4800 chars each", () => {
    expect(
      estimateMessageTokens({
        role: "user",
        content: [{ type: "image", data: "", mimeType: "image/png" }],
      } as unknown as ChatMessageLike),
    ).toBe(1200);
  });

  it("counts assistant text, thinking and toolCall blocks", () => {
    expect(
      estimateMessageTokens({
        role: "assistant",
        content: [
          { type: "text", text: "aaaa" },
          { type: "thinking", thinking: "bbbb" },
          { type: "toolCall", id: "1", name: "bash", arguments: { command: "ls" } },
        ],
      } as unknown as ChatMessageLike),
    ).toBe(7); // (4 + 4 + 4 + 14) / 4 = 26/4 -> ceil = 7
  });

  it("counts toolResult content", () => {
    expect(
      estimateMessageTokens({
        role: "toolResult",
        toolName: "bash",
        content: [{ type: "text", text: "abcdefgh" }],
      } as unknown as ChatMessageLike),
    ).toBe(2);
  });

  it("counts bashExecution command + output", () => {
    expect(estimateMessageTokens({ role: "bashExecution", command: "j", output: "kkkk" })).toBe(2);
  });

  it("counts summary messages", () => {
    expect(
      estimateMessageTokens({ role: "compactionSummary", summary: "abc", tokensBefore: 0 } as unknown as ChatMessageLike),
    ).toBe(1);
    expect(
      estimateMessageTokens({ role: "branchSummary", summary: "abcd", fromId: "x" } as unknown as ChatMessageLike),
    ).toBe(1);
  });

  it("returns 0 for unknown roles", () => {
    expect(estimateMessageTokens({ role: "unknown" })).toBe(0);
  });
});

describe("computeContextBreakdown", () => {
  it("computes five categories, conversation split and ratios", () => {
    const input: ContextBreakdownInput = {
      customPrompt: "aaaaaaaa", // 8 chars -> 2
      guidelines: ["bbbb"], // 4 -> 1
      appendSystemPrompt: "cccc", // 4 -> 1
      contextFiles: [{ path: "AGENTS.md", content: "dddddddd" }], // "AGENTS.md\ndddddddd" = 17 chars -> 5
      skills: [{ name: "skill1", description: "eeee" }], // 10 -> 3
      toolSnippets: { read: "ffffffff" }, // 8 -> 2
      messages: [
        { role: "user", content: "gggg" }, // 1
        { role: "assistant", content: [{ type: "text", text: "hhhh" }] }, // 1
        { role: "toolResult", toolName: "bash", content: [{ type: "text", text: "iiii" }] } as ChatMessageLike, // 1
        { role: "bashExecution", command: "j", output: "kkkk" }, // 5 -> 2
      ],
    };

    const result = computeContextBreakdown(input);

    expect(result.categories.find((c) => c.key === "system")?.tokens).toBe(4); // 2 + 1 + 1
    expect(result.categories.find((c) => c.key === "contextFiles")?.tokens).toBe(5);
    expect(result.categories.find((c) => c.key === "skills")?.tokens).toBe(3);
    expect(result.categories.find((c) => c.key === "tools")?.tokens).toBe(2);
    expect(result.categories.find((c) => c.key === "conversation")?.tokens).toBe(5);

    expect(result.conversation).toEqual({ user: 1, assistant: 1, toolResult: 3, other: 0, total: 5 });
    expect(result.total).toBe(19);

    expect(result.ratios.system).toBeCloseTo(4 / 19, 3);
    expect(result.ratios.conversation).toBeCloseTo(5 / 19, 3);
  });

  it("handles empty input without crashing", () => {
    const result = computeContextBreakdown({
      customPrompt: null,
      guidelines: [],
      appendSystemPrompt: null,
      contextFiles: [],
      skills: [],
      toolSnippets: {},
      messages: [],
    });
    expect(result.total).toBe(0);
    expect(result.ratios.system).toBe(0);
    expect(result.conversation.total).toBe(0);
  });

  it("includes non-split roles in conversation total only", () => {
    const result = computeContextBreakdown({
      customPrompt: null,
      guidelines: [],
      appendSystemPrompt: null,
      contextFiles: [],
      skills: [],
      toolSnippets: {},
      messages: [
        { role: "user", content: "gggg" }, // 1 -> user
        { role: "custom", customType: "x", content: "hhhhhhhh", display: false } as ChatMessageLike, // 2 -> other
      ],
    });
    expect(result.conversation.user).toBe(1);
    expect(result.conversation.assistant).toBe(0);
    expect(result.conversation.toolResult).toBe(0);
    expect(result.conversation.other).toBe(2);
    expect(result.conversation.total).toBe(3);
  });

  it("joins guidelines with newline", () => {
    const result = computeContextBreakdown({
      customPrompt: null,
      guidelines: ["bbbb", "cccc"],
      appendSystemPrompt: null,
      contextFiles: [],
      skills: [],
      toolSnippets: {},
      messages: [],
    });
    // "bbbb\ncccc" = 9 chars -> 3
    expect(result.categories.find((c) => c.key === "system")?.tokens).toBe(3);
  });
});

describe("contextMessagesFromEntries", () => {
  it("projects message entries and summary entries in order", () => {
    const entries = [
      { type: "label", label: "x" },
      { type: "message", message: { role: "user", content: "hi" } },
      { type: "model_change", provider: "p", modelId: "m" },
      { type: "compaction", summary: "early part" },
      { type: "message", message: { role: "assistant", content: [{ type: "text", text: "yo" }] } },
      { type: "branch_summary", summary: "left branch" },
      { type: "custom", customType: "x", data: {} },
    ];
    expect(contextMessagesFromEntries(entries)).toEqual([
      { role: "user", content: "hi" },
      { role: "compactionSummary", summary: "early part" },
      { role: "assistant", content: [{ type: "text", text: "yo" }] },
      { role: "branchSummary", summary: "left branch" },
    ]);
  });

  it("projects custom_message entries as role custom messages (participate in context)", () => {
    const entries = [
      { type: "custom_message", customType: "plan-mode", content: "Plan mode enabled", display: true },
      { type: "custom", customType: "status-panel", data: { some: "snapshot" } },
    ];
    expect(contextMessagesFromEntries(entries)).toEqual([{ role: "custom", content: "Plan mode enabled" }]);
  });

  it("skips summary entries without text", () => {
    expect(contextMessagesFromEntries([{ type: "compaction", summary: "" }])).toEqual([]);
  });
});

describe("R20：parseSystemPromptSections（降级文本解析）", () => {
  // 模拟 pi 0.84.1 buildSystemPrompt 输出结构（默认提示词 + 工具 + 文件 + 技能）
  const SAMPLE = `You are an expert coding assistant operating inside pi, a coding agent harness. You help users by reading files, executing commands, editing code, and writing new files.

Available tools:
- read: Read file contents
- bash: Execute bash commands
- edit: Make precise file edits

In addition to the tools above, you may have access to other custom tools depending on the project.

Guidelines:
- Be concise in your responses
- Show file paths clearly when working with files

Pi documentation (read only when the user asks about pi itself, its SDK, extensions, themes, skills, or TUI):
- Main documentation: /path/README.md

<project_context>

Project-specific instructions and guidelines:

<project_instructions path="/home/kefka/projects/pi-extensions/AGENTS.md">
# AGENTS.md 项目说明
迭代流程硬约束
</project_instructions>

<project_instructions path="/home/kefka/projects/pi-extensions/.agents/templates/spec.md">
# spec 模板
User Stories P1/P2/P3
</project_instructions>

</project_context>

The following skills provide specialized instructions for specific tasks.
Use the read tool to load a skill's file when the task matches its description.

<available_skills>
  <skill>
    <name>code-review</name>
    <description>Review the changes since a fixed point</description>
  </skill>
  <skill>
    <name>effect-ts</name>
    <description>Use this skill whenever working in a repository that uses Effect</description>
  </skill>
</available_skills>

Current working directory: /home/kefka/projects/pi-extensions`;

  it("三类明细均解析非 0（工具段/文件段/技能段）", () => {
    const s = parseSystemPromptSections(SAMPLE);
    expect(s.tools).toBeGreaterThan(0);
    expect(s.contextFiles).toBeGreaterThan(0);
    expect(s.skills).toBeGreaterThan(0);
    // 工具段：3 行 snippet
    expect(s.tools).toBeGreaterThanOrEqual(3);
  });

  it("无 project_instructions 段 → contextFiles = 0（不抛错）", () => {
    const s = parseSystemPromptSections("Available tools:\n- read: x\n\nGuidelines:\n- be\n");
    expect(s.contextFiles).toBe(0);
    expect(s.tools).toBeGreaterThan(0);
    expect(s.skills).toBe(0);
  });

  it("system 估算 = estimateTextTokens(全文)", () => {
    expect(estimateTextTokens(SAMPLE)).toBe(estimateTextTokens(SAMPLE));
    expect(estimateTextTokens(SAMPLE)).toBe(Math.ceil(SAMPLE.length / 4));
  });

  it("空字符串 → 全 0", () => {
    expect(parseSystemPromptSections("")).toEqual({ contextFiles: 0, tools: 0, skills: 0 });
  });
});
