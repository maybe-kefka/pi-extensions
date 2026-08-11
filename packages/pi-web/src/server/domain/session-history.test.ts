import { describe, expect, it } from "vitest";
import { parseSessionEntries, parseSessionJsonl, readSessionHistory } from "./session-history";

describe("parseSessionJsonl", () => {
  it("逐行解析；空行/坏行跳过", () => {
    const entries = parseSessionJsonl(
      [
        JSON.stringify({ type: "message", message: { role: "user", content: "hi" } }),
        "",
        "bad json",
        JSON.stringify({ type: "message", message: { role: "assistant", content: "yo" } }),
      ].join("\n"),
    );
    expect(entries).toHaveLength(2);
    expect(entries[0].message?.role).toBe("user");
  });
});

describe("parseSessionEntries", () => {
  it("user/assistant 消息顺序与 userIndex；toolResult 关联到 toolCall", () => {
    const messages = parseSessionEntries([
      { type: "message", message: { role: "user", content: "帮我查文件" } },
      {
        type: "message",
        message: {
          role: "assistant",
          content: [
            { type: "text", text: "我来查" },
            {
              type: "toolCall",
              id: "tc-1",
              name: "read_file",
              arguments: { path: "a.txt" },
            },
          ],
        },
      },
      { type: "message", message: { role: "toolResult", toolCallId: "tc-1", content: "文件内容", isError: false } },
      { type: "message", message: { role: "user", content: "继续" } },
    ]);
    expect(messages).toHaveLength(3);
    expect(messages[0]).toEqual({ role: "user", text: "帮我查文件", thinking: "", toolCalls: [], userIndex: 0 });
    expect(messages[1].role).toBe("assistant");
    expect(messages[1].toolCalls).toHaveLength(1);
    expect(messages[1].toolCalls[0]).toMatchObject({ id: "tc-1", name: "read_file", result: "文件内容", isError: false });
    expect(messages[2].userIndex).toBe(1);
  });

  it("空 assistant 消息筛掉；toolResult 本身不产出消息", () => {
    const messages = parseSessionEntries([
      { type: "message", message: { role: "assistant", content: [] } },
      { type: "message", message: { role: "toolResult", toolCallId: "x", content: "r" } },
      { type: "message", message: { role: "user", content: "q" } },
    ]);
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe("user");
  });
});

describe("readSessionHistory", () => {
  it("按文件读历史；文件不可读返回 null", () => {
    const files: Record<string, string> = {
      "/s/a.jsonl": [
        JSON.stringify({ type: "message", message: { role: "user", content: "hi" } }),
        JSON.stringify({ type: "message", message: { role: "assistant", content: "yo" } }),
      ].join("\n"),
    };
    const history = readSessionHistory("/s/a.jsonl", (p) => files[p]);
    expect(history).toHaveLength(2);
    expect(readSessionHistory("/s/missing.jsonl", (p) => files[p])).toBeNull();
  });
});
