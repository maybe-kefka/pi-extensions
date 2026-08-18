// @vitest-environment jsdom
// ActivityBar 渲染测试：图标面板切换/收起
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ActivityBar, type ActivityPanel } from "./ActivityBar";

describe("ActivityBar", () => {
  afterEach(cleanup);

  it("渲染四个面板图标", () => {
    render(<ActivityBar active={null} onSelect={vi.fn()} />);
    expect(screen.getByTitle("文件浏览")).toBeTruthy();
    expect(screen.getByTitle("git 控制")).toBeTruthy();
    expect(screen.getByTitle("会话管理")).toBeTruthy();
    expect(screen.getByTitle("设置")).toBeTruthy();
  });

  it("按钮暴露 pressed 状态与可访问名称；点同图标收起", () => {
    const onSelect = vi.fn();
    render(<ActivityBar active="sessions" onSelect={onSelect} />);
    const sessions = screen.getByRole("button", { name: "会话管理" });
    expect(sessions.getAttribute("aria-pressed")).toBe("true");
    expect(sessions.hasAttribute("aria-selected")).toBe(false);
    fireEvent.click(sessions);
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it("点击未选图标选择面板", () => {
    const onSelect = vi.fn();
    render(<ActivityBar active={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: "会话管理" }));
    expect(onSelect).toHaveBeenCalledWith("sessions");
  });

  it("激活面板高亮", () => {
    const { container } = render(<ActivityBar active="files" onSelect={vi.fn()} />);
    const active = container.querySelector('[aria-pressed="true"]');
    expect(active?.getAttribute("aria-label")).toBe("文件浏览");
  });
});
