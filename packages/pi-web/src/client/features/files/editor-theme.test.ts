// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { getByRole } from "@testing-library/dom";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { generateThemeCss } from "@/entities/theme";
import {
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
  it("真实编辑器暴露有名称的 textbox 与键盘可达滚动区", () => {
    const parent = document.createElement("div");
    document.body.append(parent);
    const view = new EditorView({
      state: EditorState.create({ doc: "const answer = 42;", extensions: createEditorTheme() }),
      parent,
    });

    expect(getByRole(parent, "textbox", { name: "代码编辑器" })).toBe(view.contentDOM);
    const scroller = getByRole(parent, "region", { name: "代码滚动区域" });
    expect(scroller).toBe(view.scrollDOM);
    expect(scroller.tabIndex).toBe(0);

    view.destroy();
    parent.remove();
  });
});
