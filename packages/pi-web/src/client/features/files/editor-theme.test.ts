import { describe, expect, it } from "vitest";
import { generateThemeCss } from "@/entities/theme";
import {
  EDITOR_CONTENT_ATTRIBUTES,
  EDITOR_SCROLLER_ATTRIBUTES,
  SYNTAX_TOKEN_MAP,
  createEditorTheme,
} from "./editor-theme.js";

describe("SYNTAX_TOKEN_MAP", () => {
  it("编辑器语法角色使用主题契约的 syntax 变量", () => {
    expect(SYNTAX_TOKEN_MAP).toMatchObject({
      keyword: "var(--syntax-keyword)",
      string: "var(--syntax-string)",
      comment: "var(--syntax-comment)",
      number: "var(--syntax-number)",
      function: "var(--syntax-function)",
      typeName: "var(--syntax-type)",
      operator: "var(--syntax-operator)",
      property: "var(--syntax-property)",
    });
  });

  it("语法角色齐全且全部引用语义 CSS 变量", () => {
    const required = ["keyword", "string", "comment", "number", "function", "typeName", "operator", "property", "default"];
    for (const role of required) {
      expect(SYNTAX_TOKEN_MAP[role], role).toMatch(/^var\(--/);
    }
  });

  it("引用变量均来自项目语义集（不引用不存在的变量）", () => {
    const generatedTheme = generateThemeCss("github", "light");
    for (const value of Object.values(SYNTAX_TOKEN_MAP)) {
      const m = value.match(/var\((--[a-z0-9-]+)/);
      expect(m, value).toBeTruthy();
      expect(generatedTheme).toContain(`  ${m![1]}:`);
    }
  });

  it("语义色不与文本色重复（keyword 用 primary 而非 foreground）", () => {
    expect(SYNTAX_TOKEN_MAP.keyword).not.toBe(SYNTAX_TOKEN_MAP.default);
    expect(SYNTAX_TOKEN_MAP.comment).not.toBe(SYNTAX_TOKEN_MAP.default);
  });
});

describe("createEditorTheme", () => {
  it("为可编辑内容提供明确的 textbox 名称", () => {
    expect(EDITOR_CONTENT_ATTRIBUTES).toEqual({ "aria-label": "代码编辑器" });
  });

  it("为滚动视口提供键盘可达的 region 契约", () => {
    expect(EDITOR_SCROLLER_ATTRIBUTES).toEqual({
      role: "region",
      "aria-label": "代码滚动区域",
      tabindex: "0",
    });
  });

  it("返回可组装扩展（数组含高亮与视图主题）", () => {
    const ext = createEditorTheme() as unknown[];
    expect(Array.isArray(ext)).toBe(true);
    // 冒烟：不抛错（CodeMirror 扩展是惰性结构）
    expect(String(ext[0]).length).toBeGreaterThan(0);
  });
});
