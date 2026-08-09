/**
 * 上拉框触发状态机（纯函数，TDD，SPEC §7 R16）：
 * - space 后紧跟 "/" → 激活 skill/命令面板；space 后紧跟 "@" → 激活文件面板
 * - 激活后普通字符累积进 query；空格 = 放弃命令输入（关闭面板）；Backspace 删 query，query 空再删 → 取消
 * - Escape 取消（触发字符保留在文本中）；Enter/ArrowUp/ArrowDown 不改变状态（组件层处理）
 */

export type MentionKind = "skill" | "file";

export interface MentionState {
  active: boolean;
  kind: MentionKind | null;
  /** 触发后继续输入的过滤词（不含触发字符本身） */
  query: string;
  /** 上一个键是否为空格（触发记忆） */
  prevWasSpace: boolean;
}

export const mentionInitial: MentionState = {
  active: false,
  kind: null,
  query: "",
  prevWasSpace: false,
};

const NAV_KEYS = new Set(["Enter", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Shift", "Control", "Alt", "Meta"]);

export function mentionKey(state: MentionState, key: string): MentionState {
  // 面板激活中：只处理字符累积 / Backspace / Escape；导航键原样返回
  if (state.active) {
    if (key === "Escape") return { ...mentionInitial };
    if (key === "Backspace") {
      if (state.query.length > 0) return { ...state, query: state.query.slice(0, -1) };
      return { ...mentionInitial };
    }
    if (NAV_KEYS.has(key)) return state;
    // R25：激活态按空格 = 放弃命令输入（`/abc ` 只想输入纯文本）→ 关闭面板；
    // 触发字符与文本保留在输入框（组件层不动编辑器内容），prevWasSpace 一并清
    if (key === " ") return { ...mentionInitial };
    // 普通字符（不含空格）进 query
    if (key.length === 1) return { ...state, query: state.query + key };
    return state;
  }

  // 非激活：检测触发序列
  // R21：修饰/导航键（含 Shift——@ 需 Shift+2）不打断触发序列（不重置 prevWasSpace）
  if (NAV_KEYS.has(key)) return state;
  if (key === " ") return { ...state, prevWasSpace: true };
  if (state.prevWasSpace && key === "/") return { active: true, kind: "skill", query: "", prevWasSpace: false };
  if (state.prevWasSpace && key === "@") return { active: true, kind: "file", query: "", prevWasSpace: false };
  return { ...state, prevWasSpace: false };
}

/**
 * R18：带"光标在输入框行首"上下文的触发检测——行首（光标前无任何内容）时
 * 把 prevWasSpace 视为 true（首个 `/` `@` 直接触发），否则与 mentionKey 完全一致。
 * 行首标志对非触发键无污染（mentionKey 返回时 prevWasSpace 重置）。
 */
export function mentionKeyAt(state: MentionState, key: string, cursorAtStart: boolean): MentionState {
  return mentionKey(cursorAtStart ? { ...state, prevWasSpace: true } : state, key);
}

/**
 * R18：从光标前全文反推上拉框 query（IME 上屏等不经 keydown 的输入）。
 * 取最近触发序列（空格+斜杠 / 空格+@，空格可为 nbsp）之后的文本；
 * 无空格序列但以 / 或 @ 开头（行首触发）→ 取其后文本；无触发上下文 → null。
 */
export function deriveQueryFromHead(head: string): string | null {
  let idx = -1;
  for (const sp of [" ", "\u00a0"]) {
    const i = Math.max(head.lastIndexOf(sp + "/"), head.lastIndexOf(sp + "@"));
    if (i > idx) idx = i;
  }
  if (idx >= 0) return head.slice(idx + 2);
  if (head.startsWith("/") || head.startsWith("@")) return head.slice(1);
  return null;
}

export interface MentionItem {
  id: string;
  label: string;
}

/**
 * 候选过滤（大小写不敏感）：包含匹配 label（R17 后 skills 显示 `skill:<name>`，
 * 用户输入 `cod` 需匹配 `skill:code-review`——前缀匹配只认 "skill" 开头，故用包含）；
 * 空 query 返回全部。
 */
export function filterMentionItems<T extends MentionItem>(items: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((i) => i.label.toLowerCase().includes(q));
}
