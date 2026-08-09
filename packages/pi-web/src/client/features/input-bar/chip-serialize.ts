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

// ---------------------------------------------------------------------------
// R22：chip 标记（不可见分隔符包裹 chip 值，精确区分 chip 与手打文本）
// ---------------------------------------------------------------------------

export const SKILL_MARK_PREFIX = "\u0001skill:";
export const FILE_MARK_PREFIX = "\u0001file:";
export const MARK_SUFFIX = "\u0001";

export type UserContentSegment =
  | { type: "text"; text: string }
  | { type: "skill"; name: string }
  | { type: "file"; path: string };

/** 解析标记文本 → 段列表（chip 段 + 文本段，顺序保持）。无标记 → 单文本段。 */
export function parseChipMarks(text: string): UserContentSegment[] {
  const segments: UserContentSegment[] = [];
  let cursor = 0;
  let rest = text;
  while (rest.length > 0) {
    const si = rest.indexOf("\u0001");
    if (si < 0) {
      segments.push({ type: "text", text: rest });
      break;
    }
    if (si > 0) segments.push({ type: "text", text: rest.slice(0, si) });
    const ei = rest.indexOf("\u0001", si + 1);
    if (ei < 0) {
      segments.push({ type: "text", text: rest.slice(si) });
      break;
    }
    const inner = rest.slice(si + 1, ei);
    if (inner.startsWith("skill:")) {
      segments.push({ type: "skill", name: inner.slice("skill:".length) });
    } else if (inner.startsWith("file:")) {
      segments.push({ type: "file", path: inner.slice("file:".length) });
    } else {
      segments.push({ type: "text", text: rest.slice(si, ei + 1) });
    }
    rest = rest.slice(ei + 1);
    cursor += ei + 1;
  }
  return segments;
}

/**
 * R22：Backspace 删除目标判定（纯函数）。
 * 光标落在 chip 原子元素内（contenteditable=false，正常不可进入但删空后可能悬空）
 * 或紧贴 chip 后无任何内容时 → 返回该 chip（InputBar 手动删除）；否则 null。
 */
export function backspaceAtChip(root: HTMLElement, range: Range): { chip: HTMLElement } | null {
  const isChipEl = (n: Node | null): n is HTMLElement =>
    n instanceof HTMLElement && n.dataset?.insert !== undefined;
  // 光标起点在 chip 内
  if (isChipEl(range.startContainer)) return { chip: range.startContainer };
  // 光标在根元素上且紧贴 chip 之后（offset 指向 chip 后一位，其后无内容）
  if (range.startContainer === root && range.collapsed) {
    const prev = root.childNodes[range.startOffset - 1];
    if (isChipEl(prev)) return { chip: prev };
  }
  return null;
}
