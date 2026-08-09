/**
 * contenteditable 输入区序列化（纯函数，TDD）。
 * DOM 结构：文本节点 + <br>（换行）+ span[data-insert]（原子 chip）。
 * chip 还原为其 data-insert 值（插入文本），与文本按 DOM 顺序拼接。
 */

export function serializeContent(root: HTMLElement): string {
  let out = "";
  const walk = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent ?? "";
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    if (el.tagName === "BR") {
      out += "\n";
      return;
    }
    if (el.dataset && el.dataset.insert !== undefined) {
      out += el.dataset.insert;
      return;
    }
    for (const child of el.childNodes) walk(child);
  };
  for (const child of root.childNodes) walk(child);
  return out;
}

/** 判断 DOM 是否为空（无文本、无 chip、无换行） */
export function isContentEmpty(root: HTMLElement): boolean {
  return serializeContent(root).trim().length === 0;
}
