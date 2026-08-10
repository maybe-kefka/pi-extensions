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

  it("点击图标选中（aria-selected）；点同图标收起", () => {
    const onSelect = vi.fn();
    render(<ActivityBar active={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByTitle("会话管理"));
    expect(onSelect).toHaveBeenCalledWith("sessions");
  });

  it("激活面板高亮", () => {
    const { container } = render(<ActivityBar active="files" onSelect={vi.fn()} />);
    const active = container.querySelector('[aria-selected="true"]');
    expect(active?.getAttribute("title")).toBe("文件浏览");
  });
});
