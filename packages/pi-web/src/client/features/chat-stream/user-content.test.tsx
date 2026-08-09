// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { renderUserContent, UserContentChip, parseUserContent } from "./user-content";

describe("parseUserContent", () => {
  it("普通文本 → 单文本段", () => {
    expect(parseUserContent("你好 pi")).toEqual([{ type: "text", text: "你好 pi" }]);
  });

  it("skill XML 段 → skill chip 段", () => {
    expect(
      parseUserContent(
        '<skill name="code-review" location="/x/SKILL.md">\nReferences are relative to /x.\n\n正文\n</skill>',
      ),
    ).toEqual([{ type: "skill", name: "code-review" }]);
  });

  it("文件路径 → file chip 段", () => {
    expect(parseUserContent("请读 src/a.ts 文件")).toEqual([
      { type: "text", text: "请读 " },
      { type: "file", path: "src/a.ts" },
      { type: "text", text: " 文件" },
    ]);
  });

  it("URL 与数字不误判为路径", () => {
    expect(parseUserContent("访问 https://a.com/b 或 123.45")).toEqual([
      { type: "text", text: "访问 https://a.com/b 或 123.45" },
    ]);
  });

  it("混合：XML + 路径 + 文本顺序保持", () => {
    const segs = parseUserContent("先 <skill name=\"pdf\" location=\"/p\">\n</skill> 再 src/main.ts");
    expect(segs).toEqual([
      { type: "text", text: "先 " },
      { type: "skill", name: "pdf" },
      { type: "text", text: " 再 " },
      { type: "file", path: "src/main.ts" },
    ]);
  });
});

describe("renderUserContent", () => {
  it("渲染 chip 与文本", () => {
    const { container } = render(<UserContentChip text={`用 <skill name="pdf" location="/p">\n</skill> 处理`} />);
    expect(container.querySelector("[data-slot=user-chip]")).toBeTruthy();
    expect(container.textContent).toContain("pdf");
    expect(container.textContent).toContain("处理");
  });
});
