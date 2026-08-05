import { describe, expect, it } from "vitest";
import {
  computeContextBreakdown,
  contextMessagesFromEntries,
  estimateMessageTokens,
  estimateTextTokens,
  type ChatMessageLike,
  type ContextBreakdownInput,
} from "../src/context-breakdown.js";

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
