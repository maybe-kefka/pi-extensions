import { describe, expect, it } from "vitest";
import { SYNTAX_TOKEN_MAP, createEditorTheme } from "./editor-theme.js";

describe("SYNTAX_TOKEN_MAP", () => {
  it("语法角色齐全且全部引用语义 CSS 变量", () => {
    const required = ["keyword", "string", "comment", "number", "function", "typeName", "operator", "property", "default"];
    for (const role of required) {
      expect(SYNTAX_TOKEN_MAP[role], role).toMatch(/^var\(--/);
    }
  });

  it("引用变量均来自项目语义集（不引用不存在的变量）", () => {
    const validVars = new Set([
      "--background", "--foreground", "--primary", "--success", "--muted-foreground",
      "--chart-1", "--chart-2", "--chart-3", "--chart-4", "--chart-5", "--destructive",
    ]);
    for (const value of Object.values(SYNTAX_TOKEN_MAP)) {
      const m = value.match(/var\((--[a-z0-9-]+)/);
      expect(m, value).toBeTruthy();
      expect(validVars.has(m![1]), `${m![1]} 不在语义变量集`).toBe(true);
    }
  });

  it("语义色不与文本色重复（keyword 用 primary 而非 foreground）", () => {
    expect(SYNTAX_TOKEN_MAP.keyword).not.toBe(SYNTAX_TOKEN_MAP.default);
    expect(SYNTAX_TOKEN_MAP.comment).not.toBe(SYNTAX_TOKEN_MAP.default);
  });
});

describe("createEditorTheme", () => {
  it("返回可组装扩展（数组含高亮与视图主题）", () => {
    const ext = createEditorTheme() as unknown[];
    expect(Array.isArray(ext)).toBe(true);
    expect(ext).toHaveLength(2);
    // 冒烟：不抛错（CodeMirror 扩展是惰性结构）
    expect(String(ext[0]).length).toBeGreaterThan(0);
  });
});
