import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { Markdown } from "./markdown";

afterEach(cleanup);

describe("Markdown", () => {
  it("渲染加粗/强调/链接", async () => {
    render(<Markdown text="**加粗** 和 [链接](https://example.com)" />);
    expect((await screen.findByText("加粗")).tagName).toBe("STRONG");
    const a = screen.getByRole("link", { name: "链接" });
    expect(a).toHaveAttribute("href", "https://example.com");
    expect(a).toHaveAttribute("target", "_blank");
    expect(a).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("渲染 GFM 表格", async () => {
    render(<Markdown text={"| a | b |\n|---|---|\n| 1 | 2 |"} />);
    expect(await screen.findByRole("table")).toBeTruthy();
    expect(screen.getByText("1")).toBeTruthy();
  });

  it("渲染任务列表", async () => {
    render(<Markdown text={"- [x] 完成\n- [ ] 待办"} />);
    expect((await screen.findAllByRole("checkbox")).length).toBe(2);
    expect(screen.getByText("完成")).toBeTruthy();
  });

  it("代码块：语言标签 + 复制按钮 + 高亮 class", async () => {
    const { container } = render(<Markdown text={"```ts\nconst x = 1;\n```"} />);
    expect(await screen.findByText("ts")).toBeTruthy(); // 语言标签
    expect(screen.getByRole("button", { name: /复制/ })).toBeTruthy();
    const code = container.querySelector("pre code");
    expect(code).toBeTruthy();
    expect(code?.textContent).toContain("const x = 1;");
    expect(code?.className).toContain("hljs");
  });

  it("行内代码走小样式（无语言标签/无复制按钮）", async () => {
    render(<Markdown text="用 `npm install` 安装" />);
    expect((await screen.findByText("npm install")).tagName).toBe("CODE");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("普通段落文本可见", async () => {
    render(<Markdown text="你好世界" />);
    expect(await screen.findByText("你好世界")).toBeTruthy();
  });

  it("空文本安全（无输出不崩）", async () => {
    const { container } = render(<Markdown text="" />);
    expect(container.querySelector(".markdown-body")).toBeTruthy();
  });

  it("原始 HTML 不执行（XSS 安全默认）", async () => {
    render(<Markdown text={'<img src=x onerror="window.__xss=1">'} />);
    expect(await screen.findByText('<img src=x onerror="window.__xss=1">')).toBeTruthy();
    expect(document.querySelector("img")).toBeNull();
  });
});
