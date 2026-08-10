// @vitest-environment jsdom
// TabsBar 渲染测试：文件/聊天 tab、激活高亮、关闭按钮
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TabsBar } from "./TabsBar";
import type { WorkspaceTab } from "@/entities/workspace/tabs";

afterEach(cleanup);

const tabs: WorkspaceTab[] = [
  { kind: "chat" },
  { kind: "file", path: "a.ts", name: "a.ts", dirty: false, preview: false },
  { kind: "file", path: "b.ts", name: "b.ts", dirty: false, preview: false },
];

describe("TabsBar", () => {
  it("渲染聊天 tab（会话名标签）与文件 tab", () => {
    render(<TabsBar tabs={tabs} active="chat" sessionName="pi-web 开发" onActivate={vi.fn()} onClose={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByText("pi-web 开发")).toBeTruthy();
    expect(screen.getByText("a.ts")).toBeTruthy();
    expect(screen.getByText("b.ts")).toBeTruthy();
  });

  it("激活 tab 高亮（aria-selected）", () => {
    const { container } = render(
      <TabsBar tabs={tabs} active="a.ts" sessionName="s" onActivate={vi.fn()} onClose={vi.fn()} onSave={vi.fn()} />,
    );
    const active = container.querySelector('[aria-selected="true"]');
    expect(active?.textContent).toContain("a.ts");
  });

  it("点击 tab 触发激活", () => {
    const onActivate = vi.fn();
    render(<TabsBar tabs={tabs} active="chat" sessionName="s" onActivate={onActivate} onClose={vi.fn()} onSave={vi.fn()} />);
    fireEvent.click(screen.getByText("b.ts"));
    expect(onActivate).toHaveBeenCalledWith("b.ts");
  });

  it("点击关闭按钮触发关闭（不触发激活）", () => {
    const onActivate = vi.fn();
    const onClose = vi.fn();
    render(<TabsBar tabs={tabs} active="chat" sessionName="s" onActivate={onActivate} onClose={onClose} onSave={vi.fn()} />);
    const closeBtns = screen.getAllByTitle("关闭 tab");
    fireEvent.click(closeBtns[1]); // b.ts 的关闭
    expect(onClose).toHaveBeenCalledWith("b.ts");
    expect(onActivate).not.toHaveBeenCalled();
  });

  it("聊天 tab 无关闭按钮", () => {
    render(<TabsBar tabs={tabs} active="chat" sessionName="s" onActivate={vi.fn()} onClose={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getAllByTitle("关闭 tab")).toHaveLength(2); // 仅文件 tab
  });
});

describe("TabsBar dirty 与保存", () => {
  afterEach(cleanup);

  const dirtyTabs: WorkspaceTab[] = [
    { kind: "chat" },
    { kind: "file", path: "a.ts", name: "a.ts", dirty: true, preview: false },
  ];

  it("dirty 文件 tab 显示圆点（title=未保存）", () => {
    render(<TabsBar tabs={dirtyTabs} active="a.ts" sessionName="s" onActivate={vi.fn()} onClose={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByTitle("未保存")).toBeTruthy();
  });

  it("激活文件 dirty 时显示保存按钮；点击触发 onSave", () => {
    const onSave = vi.fn();
    render(<TabsBar tabs={dirtyTabs} active="a.ts" sessionName="s" onActivate={vi.fn()} onClose={vi.fn()} onSave={onSave} />);
    fireEvent.click(screen.getByText("保存"));
    expect(onSave).toHaveBeenCalled();
  });

  it("激活文件不脏或激活聊天时无保存按钮", () => {
    render(<TabsBar tabs={dirtyTabs} active="chat" sessionName="s" onActivate={vi.fn()} onClose={vi.fn()} onSave={vi.fn()} />);
    expect(screen.queryByText("保存")).toBeNull();
  });
});
