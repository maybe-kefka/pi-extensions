/**
 * R22：skill/file chip 标记展开（纯函数，TDD）。
 * 只展开标记内的 chip（\u0001skill:name\u0001 / \u0001file:path\u0001）——
 * 手打文本不受影响。XML 格式复刻 pi 内核 _expandSkillCommand（agent-session.js）。
 */

export interface SkillLookupEntry {
  /** skill 名（裸名，无 skill: 前缀） */
  name: string;
  /** SKILL.md 绝对路径 */
  path: string;
  /** 相对引用基准目录 */
  baseDir: string;
  /** skill 文件全文（含 frontmatter） */
  content: string;
}

/** 剥离 --- 前导 frontmatter */
export function stripFrontmatter(text: string): string {
  const m = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(text);
  return m ? text.slice(m[0].length) : text;
}

export function buildSkillBlock(s: SkillLookupEntry): string {
  const body = stripFrontmatter(s.content).trim();
  return `<skill name="${s.name}" location="${s.path}">\nReferences are relative to ${s.baseDir}.\n\n${body}\n</skill>`;
}

/**
 * 展开文本中的 chip 标记：
 * - \u0001skill:name\u0001 → skill XML（未知 skill 保留原文）
 * - \u0001file:path\u0001 → 剥离标记为路径文本
 * 其余文本原样。
 */
export function expandSkillChips(text: string, skills: SkillLookupEntry[]): string {
  let out = "";
  let rest = text;
  while (rest.length > 0) {
    const si = rest.indexOf("\u0001");
    if (si < 0) {
      out += rest;
      break;
    }
    out += rest.slice(0, si);
    const ei = rest.indexOf("\u0001", si + 1);
    if (ei < 0) {
      out += rest.slice(si);
      break;
    }
    const inner = rest.slice(si + 1, ei);
    if (inner.startsWith("skill:")) {
      const name = inner.slice("skill:".length);
      const skill = skills.find((s) => s.name === name);
      out += skill ? buildSkillBlock(skill) : rest.slice(si, ei + 1);
    } else if (inner.startsWith("file:")) {
      out += inner.slice("file:".length);
    } else {
      out += rest.slice(si, ei + 1);
    }
    rest = rest.slice(ei + 1);
  }
  return out;
}
