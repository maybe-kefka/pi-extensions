// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { isContentEmpty, serializeContent, parseChipMarks, backspaceAtChip, SKILL_MARK_PREFIX, FILE_MARK_PREFIX } from "./chip-serialize";

function el(): HTMLElement {
  return document.createElement("div");
}

function chip(root: HTMLElement, insert: string, label: string): HTMLElement {
  const s = document.createElement("span");
  s.contentEditable = "false";
  s.dataset.insert = insert;
  s.textContent = label;
  root.appendChild(s);
  return s;
}

describe("serializeContent", () => {
  it("纯文本原样输出", () => {
    const root = el();
    root.appendChild(document.createTextNode("你好 pi"));
    expect(serializeContent(root)).toBe("你好 pi");
  });

  it("chip 还原为 data-insert 值", () => {
    const root = el();
    root.appendChild(document.createTextNode("请读 "));
    chip(root, "src/index.ts", "📄 src/index.ts");
    root.appendChild(document.createTextNode(" 这个文件"));
    expect(serializeContent(root)).toBe("请读 src/index.ts 这个文件");
  });

  it("多个 chip + 顺序保持", () => {
    const root = el();
    chip(root, "/skill:pdf", "✨ pdf");
    root.appendChild(document.createTextNode(" "));
    chip(root, "src/main.ts", "📄 src/main.ts");
    expect(serializeContent(root)).toBe("/skill:pdf src/main.ts");
  });

  it("<br> 换行为 \\n", () => {
    const root = el();
    root.appendChild(document.createTextNode("第一行"));
    root.appendChild(document.createElement("br"));
    root.appendChild(document.createTextNode("第二行"));
    expect(serializeContent(root)).toBe("第一行\n第二行");
  });

  it("嵌套元素（如 div 块换行）递归展开", () => {
    const root = el();
    const d = document.createElement("div");
    d.appendChild(document.createTextNode("块1"));
    root.appendChild(d);
    root.appendChild(document.createElement("br"));
    root.appendChild(document.createTextNode("块2"));
    expect(serializeContent(root)).toBe("块1\n块2");
  });

  it("空容器 → 空字符串", () => {
    expect(serializeContent(el())).toBe("");
  });
});

describe("isContentEmpty", () => {
  it("空容器 / 只有空白 → true", () => {
    const a = el();
    expect(isContentEmpty(a)).toBe(true);
    const b = el();
    b.appendChild(document.createTextNode("   "));
    expect(isContentEmpty(b)).toBe(true);
  });

  it("有文本 / 有 chip → false", () => {
    const a = el();
    a.appendChild(document.createTextNode("x"));
    expect(isContentEmpty(a)).toBe(false);
    const b = el();
    chip(b, "/skill:pdf", "✨ pdf");
    expect(isContentEmpty(b)).toBe(false);
  });
});

describe("R22 chip 标记", () => {
  it("标记常量：skill/file 前缀", () => {
    expect(SKILL_MARK_PREFIX).toBe("\u0001skill:");
    expect(FILE_MARK_PREFIX).toBe("\u0001file:");
  });

  it("parseChipMarks：纯文本 → 单文本段", () => {
    expect(parseChipMarks("你好 pi")).toEqual([{ type: "text", text: "你好 pi" }]);
  });

  it("parseChipMarks：skill 标记 → chip 段", () => {
    expect(parseChipMarks("\u0001skill:code-review\u0001")).toEqual([
      { type: "skill", name: "code-review" },
    ]);
  });

  it("parseChipMarks：file 标记 → chip 段", () => {
    expect(parseChipMarks("请读 \u0001file:src/a.ts\u0001 文件")).toEqual([
      { type: "text", text: "请读 " },
      { type: "file", path: "src/a.ts" },
      { type: "text", text: " 文件" },
    ]);
  });

  it("parseChipMarks：混合多 chip 顺序保持", () => {
    expect(parseChipMarks("\u0001skill:pdf\u0001 \u0001file:src/main.ts\u0001")).toEqual([
      { type: "skill", name: "pdf" },
      { type: "text", text: " " },
      { type: "file", path: "src/main.ts" },
    ]);
  });

  it("serializeContent：chip data-insert 标记值输出", () => {
    const root = el();
    chip(root, "\u0001skill:pdf\u0001", "✨ pdf");
    root.appendChild(document.createTextNode(" "));
    chip(root, "\u0001file:src/a.ts\u0001", "📄 src/a.ts");
    expect(serializeContent(root)).toBe("\u0001skill:pdf\u0001 \u0001file:src/a.ts\u0001");
  });
});

describe("R22 backspaceAtChip", () => {
  it("光标在 chip 内（startContainer 是 chip）→ 返回删除动作", () => {
    const root = el();
    const c = chip(root, "\u0001skill:pdf\u0001", "✨ pdf");
    const range = document.createRange();
    range.setStart(c, 0);
    const r = backspaceAtChip(root, range);
    expect(r).not.toBeNull();
    expect(r?.chip).toBe(c);
  });

  it("光标在普通文本节点 → null（不干预）", () => {
    const root = el();
    const txt = document.createTextNode("abc");
    root.appendChild(txt);
    const range = document.createRange();
    range.setStart(txt, 1);
    expect(backspaceAtChip(root, range)).toBeNull();
  });

  it("chip 后无文本（光标悬空）→ 也返回 chip（Backspace 应删 chip）", () => {
    const root = el();
    const c = chip(root, "\u0001skill:pdf\u0001", "✨ pdf");
    const range = document.createRange();
    range.setStart(root, 1); // 光标在 chip 之后、无后续节点
    const r = backspaceAtChip(root, range);
    expect(r).not.toBeNull();
    expect(r?.chip).toBe(c);
  });
});
