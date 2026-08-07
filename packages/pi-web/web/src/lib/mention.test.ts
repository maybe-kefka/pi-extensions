// mention 状态机纯函数（TDD）：space+/ 触发 skill 面板、space+@ 触发文件面板
import { describe, expect, it } from "vitest";
import { mentionInitial, mentionKey, type MentionState } from "./mention";

describe("触发检测", () => {
  it("space 后紧跟 / → 触发 skill 面板", () => {
    let s = mentionInitial;
    s = mentionKey(s, "a");
    s = mentionKey(s, " ");
    expect(s.active).toBe(false);
    s = mentionKey(s, "/");
    expect(s.active).toBe(true);
    expect(s.kind).toBe("skill");
    expect(s.query).toBe("");
  });

  it("space 后紧跟 @ → 触发 file 面板", () => {
    let s = mentionInitial;
    s = mentionKey(s, " ");
    s = mentionKey(s, "@");
    expect(s.active).toBe(true);
    expect(s.kind).toBe("file");
  });

  it("无 space 前缀的单独 / 或 @ 不触发", () => {
    let s = mentionInitial;
    s = mentionKey(s, "/");
    expect(s.active).toBe(false);
    s = mentionKey(s, "@");
    expect(s.active).toBe(false);
  });

  it("space 后跟其他字符不触发（且清掉 space 记忆）", () => {
    let s = mentionInitial;
    s = mentionKey(s, " ");
    s = mentionKey(s, "x");
    expect(s.active).toBe(false);
    // 再按 / 也不触发（space 记忆已清）
    s = mentionKey(s, "/");
    expect(s.active).toBe(false);
  });

  it("连续 space 后 / 仍触发（多打空格也触发）；space→x 后不触发", () => {
    let s = mentionInitial;
    s = mentionKey(s, " ");
    s = mentionKey(s, " ");
    expect(s.active).toBe(false);
    s = mentionKey(s, "/");
    expect(s.active).toBe(true);
    expect(s.kind).toBe("skill");
  });

  it("激活后再次 space+/ 不重复触发（保持原 kind）", () => {
    let s = mentionInitial;
    s = mentionKey(s, " ");
    s = mentionKey(s, "@");
    expect(s.kind).toBe("file");
    s = mentionKey(s, " ");
    s = mentionKey(s, "/");
    expect(s.kind).toBe("file");
    expect(s.query).toBe(" /");
  });
});

describe("激活后行为", () => {
  it("普通字符累积进 query（含空格）", () => {
    let s = mentionInitial;
    s = mentionKey(s, " ");
    s = mentionKey(s, "/");
    s = mentionKey(s, "c");
    s = mentionKey(s, "o");
    expect(s.query).toBe("co");
    s = mentionKey(s, " ");
    expect(s.query).toBe("co ");
  });

  it("Backspace 删 query 末位；query 空时 Backspace 取消面板", () => {
    let s = mentionInitial;
    s = mentionKey(s, " ");
    s = mentionKey(s, "/");
    s = mentionKey(s, "c");
    s = mentionKey(s, "Backspace");
    expect(s.active).toBe(true);
    expect(s.query).toBe("");
    s = mentionKey(s, "Backspace");
    expect(s.active).toBe(false);
  });

  it("Escape 取消面板（触发字符保留在文本中，组件层不删）", () => {
    let s = mentionInitial;
    s = mentionKey(s, " ");
    s = mentionKey(s, "/");
    expect(s.active).toBe(true);
    s = mentionKey(s, "Escape");
    expect(s.active).toBe(false);
  });

  it("Enter / ArrowUp / ArrowDown 不改变状态（组件层处理选中与导航）", () => {
    let s = mentionInitial;
    s = mentionKey(s, " ");
    s = mentionKey(s, "/");
    s = mentionKey(s, "Enter");
    s = mentionKey(s, "ArrowDown");
    s = mentionKey(s, "ArrowUp");
    expect(s.active).toBe(true);
    expect(s.query).toBe("");
  });

  it("面板激活后输入 / 或 @ 本身进入 query", () => {
    let s = mentionInitial;
    s = mentionKey(s, " ");
    s = mentionKey(s, "/");
    s = mentionKey(s, "/");
    expect(s.query).toBe("/");
  });
});

describe("过滤函数", () => {
  it("filterMentionItems：前缀匹配（大小写不敏感）", async () => {
    const { filterMentionItems } = await import("./mention");
    const items = [
      { id: "code-review", label: "code-review" },
      { id: "agent-browser", label: "agent-browser" },
      { id: "compact", label: "compact" },
    ];
    expect(filterMentionItems(items, "co")).toEqual([
      { id: "code-review", label: "code-review" },
      { id: "compact", label: "compact" },
    ]);
    expect(filterMentionItems(items, "CODE")).toEqual([{ id: "code-review", label: "code-review" }]);
    expect(filterMentionItems(items, "")).toEqual(items);
    expect(filterMentionItems(items, "zz")).toEqual([]);
  });
});

export type { MentionState };
