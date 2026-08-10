/**
 * 文件名 → CodeMirror 语言扩展名映射（纯函数）。
 */

export type SupportedLang = "javascript" | "json" | "css" | "html" | "markdown" | "python";

const EXT_TO_LANG: Record<string, SupportedLang> = {
  ".ts": "javascript",
  ".tsx": "javascript",
  ".mts": "javascript",
  ".cts": "javascript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".json": "json",
  ".css": "css",
  ".scss": "css",
  ".less": "css",
  ".html": "html",
  ".htm": "html",
  ".vue": "html",
  ".md": "markdown",
  ".markdown": "markdown",
  ".py": "python",
};

/** 不支持的文件名返回 null（纯文本不高亮） */
export function langForFile(name: string): SupportedLang | null {
  const dot = name.lastIndexOf(".");
  if (dot < 0) return null;
  return EXT_TO_LANG[name.slice(dot).toLowerCase()] ?? null;
}
