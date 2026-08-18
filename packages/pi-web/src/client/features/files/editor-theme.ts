/**
 * CodeMirror 主题适配（entities/files）：颜色全部引用项目语义 CSS 变量
 * （--background/--foreground/--primary/--success/--chart-* 等）——5 套内置主题 ×
 * 深浅模式经 data-theme/.dark 自动适配，无需 per-theme 硬编码。
 */

import type { Extension } from "@codemirror/state";
import { EditorView, ViewPlugin } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

/** CodeMirror contentDOM 的公开可访问属性。 */
export const EDITOR_CONTENT_ATTRIBUTES = { "aria-label": "代码编辑器" } as const;
export const EDITOR_SCROLLER_ATTRIBUTES = {
  role: "region",
  "aria-label": "代码滚动区域",
  tabindex: "0",
} as const;

const accessibleScroller = ViewPlugin.define((view) => {
  const original = new Map<string, string | null>();
  for (const [name, value] of Object.entries(EDITOR_SCROLLER_ATTRIBUTES)) {
    original.set(name, view.scrollDOM.getAttribute(name));
    view.scrollDOM.setAttribute(name, value);
  }
  return {
    destroy() {
      for (const [name, value] of original) {
        if (value === null) view.scrollDOM.removeAttribute(name);
        else view.scrollDOM.setAttribute(name, value);
      }
    },
  };
});

/** 语法角色 → CSS 变量 映射（纯数据，供测试断言） */
export const SYNTAX_TOKEN_MAP: Record<string, string> = {
  keyword: "var(--syntax-keyword)",
  string: "var(--syntax-string)",
  comment: "var(--syntax-comment)",
  number: "var(--syntax-number)",
  function: "var(--syntax-function)",
  typeName: "var(--syntax-type)",
  operator: "var(--syntax-operator)",
  property: "var(--syntax-property)",
  default: "var(--foreground)",
};

const highlight = HighlightStyle.define([
  { tag: t.keyword, color: SYNTAX_TOKEN_MAP.keyword },
  { tag: [t.string, t.special(t.string)], color: SYNTAX_TOKEN_MAP.string },
  { tag: [t.comment, t.blockComment, t.lineComment], color: SYNTAX_TOKEN_MAP.comment, fontStyle: "italic" },
  { tag: [t.number, t.bool, t.null], color: SYNTAX_TOKEN_MAP.number },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: SYNTAX_TOKEN_MAP.function },
  { tag: [t.typeName, t.className, t.namespace], color: SYNTAX_TOKEN_MAP.typeName },
  { tag: [t.operator, t.arithmeticOperator, t.logicOperator, t.compareOperator], color: SYNTAX_TOKEN_MAP.operator },
  { tag: [t.propertyName, t.attributeName], color: SYNTAX_TOKEN_MAP.property },
  { tag: t.variableName, color: SYNTAX_TOKEN_MAP.default },
  { tag: [t.tagName, t.angleBracket], color: SYNTAX_TOKEN_MAP.keyword },
  { tag: t.invalid, color: "var(--destructive)" },
]);

const viewTheme = EditorView.theme({
  // "&" 仅生成 .ͼN（与 @uiw 默认 light 主题的 & 同特异性，DOM 注入顺序不稳定时会被 #fff 覆盖）；
  // "&.cm-editor" 特异性更高（0,2,0），确保编辑器根背景始终跟随语义变量。
  "&.cm-editor": {
    backgroundColor: "var(--editor)",
    color: "var(--foreground)",
  },
  ".cm-content": {
    caretColor: "var(--primary)",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--primary)",
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
    backgroundColor: "color-mix(in oklab, var(--primary) 25%, transparent)",
  },
  ".cm-scroller": {
    scrollbarWidth: "thin",
    scrollbarColor: "var(--muted-foreground) transparent",
  },
  ".cm-gutters": {
    backgroundColor: "var(--editor)",
    color: "var(--muted-foreground)",
    borderRight: "1px solid var(--border)",
  },
  ".cm-activeLine": {
    backgroundColor: "color-mix(in oklab, var(--muted) 60%, transparent)",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "color-mix(in oklab, var(--muted) 60%, transparent)",
    color: "var(--foreground)",
  },
  ".cm-foldPlaceholder": {
    backgroundColor: "var(--muted)",
    borderColor: "var(--border)",
    color: "var(--muted-foreground)",
  },
  ".cm-matchingBracket": {
    backgroundColor: "color-mix(in oklab, var(--primary) 20%, transparent)",
    outline: "1px solid var(--primary)",
  },
  ".cm-tooltip": {
    backgroundColor: "var(--popover)",
    color: "var(--popover-foreground)",
    border: "1px solid var(--border)",
  },
});

/** 组装扩展（纯函数；颜色映射见 SYNTAX_TOKEN_MAP） */
export function createEditorTheme(): Extension {
  return [
    viewTheme,
    EditorView.contentAttributes.of(EDITOR_CONTENT_ATTRIBUTES),
    accessibleScroller,
    syntaxHighlighting(highlight),
  ];
}
