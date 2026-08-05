// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { isContentEmpty, serializeContent } from "./chip-serialize";

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
