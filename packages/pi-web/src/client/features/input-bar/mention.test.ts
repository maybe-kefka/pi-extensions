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

  it("R21 回归：space 后按 Shift（@ 是 Shift+2）不打断触发序列", () => {
    let s = mentionInitial;
    s = mentionKey(s, " ");
    expect(s.prevWasSpace).toBe(true);
    s = mentionKey(s, "Shift");
    expect(s.prevWasSpace).toBe(true); // 修饰键不得重置 space 记忆
    s = mentionKey(s, "@");
    expect(s.active).toBe(true);
    expect(s.kind).toBe("file");
  });

  it("R21 回归：space 后按 Control/Alt/Meta 同样不打断", () => {
    let s = mentionInitial;
    s = mentionKey(s, " ");
    for (const k of ["Control", "Alt", "Meta"]) s = mentionKey(s, k);
    expect(s.prevWasSpace).toBe(true);
    s = mentionKey(s, "/");
    expect(s.active).toBe(true);
    expect(s.kind).toBe("skill");
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
  it("filterMentionItems：包含匹配（大小写不敏感）", async () => {
    const { filterMentionItems } = await import("./mention");
    const items = [
      { id: "code-review", label: "skill:code-review" },
      { id: "agent-browser", label: "skill:agent-browser" },
      { id: "compact", label: "/compact" },
    ];
    expect(filterMentionItems(items, "cod")).toEqual([{ id: "code-review", label: "skill:code-review" }]);
    expect(filterMentionItems(items, "CODE")).toEqual([{ id: "code-review", label: "skill:code-review" }]);
    expect(filterMentionItems(items, "compact")).toEqual([{ id: "compact", label: "/compact" }]);
    expect(filterMentionItems(items, "")).toEqual(items);
    expect(filterMentionItems(items, "zz")).toEqual([]);
  });
});

export type { MentionState };

describe("R17 上拉框修订", () => {
  it("skills 显示 skill:<name> 与插入 /skill:<name> 分离（InputBar 组装层约定）", async () => {
    const { filterMentionItems } = await import("./mention");
    const items = [
      { id: "skill:code-review", label: "skill:code-review", insert: "/skill:code-review" },
      { id: "cmd:compact", label: "/compact", insert: "/compact" },
    ];
    expect(filterMentionItems(items, "skill:code")).toEqual([items[0]]);
    expect(filterMentionItems(items, "/compact")).toEqual([items[1]]);
    // 显示与插入分离：label 匹配的是显示名（skill:code-review 含 code-review）
    expect(filterMentionItems(items, "code-review")).toEqual([items[0]]);
  });
});

describe("R18：行首触发与 query 反推", () => {
  it("行首触发：光标在输入框开头时 / 或 @ 直接激活", async () => {
    const { mentionKeyAt, mentionInitial } = await import("./mention");
    const s = mentionKeyAt(mentionInitial, "/", true);
    expect(s.active).toBe(true);
    expect(s.kind).toBe("skill");
    const a = mentionKeyAt(mentionInitial, "@", true);
    expect(a.active).toBe(true);
    expect(a.kind).toBe("file");
  });

  it("非行首：/ 或 @ 不触发（需前置空格）", async () => {
    const { mentionKeyAt, mentionInitial } = await import("./mention");
    expect(mentionKeyAt(mentionInitial, "/", false).active).toBe(false);
    expect(mentionKeyAt(mentionInitial, "@", false).active).toBe(false);
  });

  it("行首标志不污染普通字符（prevWasSpace 不残留）", async () => {
    const { mentionKeyAt, mentionKey, mentionInitial } = await import("./mention");
    const s = mentionKeyAt(mentionInitial, "a", true);
    expect(s.prevWasSpace).toBe(false);
    // 后续非空格字符不触发
    expect(mentionKey(s, "/").active).toBe(false);
  });

  it("行首触发后继续输入累积 query（状态机 active 分支不变）", async () => {
    const { mentionKeyAt, mentionKey, mentionInitial } = await import("./mention");
    let s = mentionKeyAt(mentionInitial, "/", true);
    s = mentionKey(s, "c");
    s = mentionKey(s, "o");
    expect(s.query).toBe("co");
  });

  it("deriveQueryFromHead：空格触发序列后的文本", async () => {
    const { deriveQueryFromHead } = await import("./mention");
    expect(deriveQueryFromHead(" /cod")).toBe("cod");
    expect(deriveQueryFromHead("abc /cod")).toBe("cod");
    expect(deriveQueryFromHead(" /web")).toBe("web");
    expect(deriveQueryFromHead(" / @")).toBe("");
  });

  it("deriveQueryFromHead：nbsp 变体（contenteditable 空格）", async () => {
    const { deriveQueryFromHead } = await import("./mention");
    expect(deriveQueryFromHead("\u00a0/cod")).toBe("cod");
    expect(deriveQueryFromHead("ab\u00a0@src")).toBe("src");
  });

  it("deriveQueryFromHead：行首模式（无空格前缀）", async () => {
    const { deriveQueryFromHead } = await import("./mention");
    expect(deriveQueryFromHead("/cod")).toBe("cod");
    expect(deriveQueryFromHead("@file")).toBe("file");
    expect(deriveQueryFromHead("/")).toBe("");
  });

  it("deriveQueryFromHead：最近触发序列优先（多段）", async () => {
    const { deriveQueryFromHead } = await import("./mention");
    expect(deriveQueryFromHead(" /web @x")).toBe("x");
  });

  it("deriveQueryFromHead：无触发上下文 → null", async () => {
    const { deriveQueryFromHead } = await import("./mention");
    expect(deriveQueryFromHead("abc")).toBeNull();
    expect(deriveQueryFromHead("abc/def")).toBeNull();
    expect(deriveQueryFromHead("path@x")).toBeNull();
    expect(deriveQueryFromHead("")).toBeNull();
  });
});
