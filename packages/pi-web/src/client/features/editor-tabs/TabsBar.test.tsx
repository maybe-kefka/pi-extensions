// @vitest-environment jsdom
// TabsBar 渲染测试：文件/聊天 tab、激活高亮、关闭按钮
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TabsBar } from "./TabsBar";
import type { WorkspaceTab } from "@/entities/workspace";

afterEach(cleanup);

const tabs: WorkspaceTab[] = [
  { kind: "chat", sessionId: "/s/a.jsonl", name: "聊天" },
  { kind: "file", path: "a.ts", name: "a.ts", dirty: false, preview: false },
  { kind: "file", path: "b.ts", name: "b.ts", dirty: false, preview: false },
];

describe("TabsBar", () => {
  it("渲染聊天 tab（tab.name 标签）与文件 tab", () => {
    render(<TabsBar tabs={tabs} active="chat:host" onActivate={vi.fn()} onClose={vi.fn()} onMove={vi.fn()}  />);
    expect(screen.getByText("聊天")).toBeTruthy();
    expect(screen.getByText("a.ts")).toBeTruthy();
    expect(screen.getByText("b.ts")).toBeTruthy();
  });

  it("chat tab 全可关（与 file 同级）", () => {
    const onClose = vi.fn();
    const { container } = render(
      <TabsBar
        tabs={[
          { kind: "chat", sessionId: "/s/a.jsonl", name: "聊天" },
          { kind: "chat", sessionId: "/s/b.jsonl", name: "会话B" },
        ]}
        active="chat:/s/a.jsonl"

        onActivate={vi.fn()}
        onClose={onClose}
        onMove={vi.fn()}
      />,
    );
    const closeBtns = container.querySelectorAll('button[title="关闭 tab"]');
    expect(closeBtns.length).toBe(2);
    fireEvent.click(closeBtns[1]!);
    expect(onClose).toHaveBeenCalledWith("chat:/s/b.jsonl");
  });

  it("激活 tab 高亮（aria-selected）", () => {
    const { container } = render(
      <TabsBar tabs={tabs} active="a.ts" onActivate={vi.fn()} onClose={vi.fn()} onMove={vi.fn()}  />,
    );
    const active = container.querySelector('[aria-selected="true"]');
    expect(active?.textContent).toContain("a.ts");
  });

  it("点击 tab 触发激活", () => {
    const onActivate = vi.fn();
    render(<TabsBar tabs={tabs} active="chat" onActivate={onActivate} onClose={vi.fn()} onMove={vi.fn()}  />);
    fireEvent.click(screen.getByText("b.ts"));
    expect(onActivate).toHaveBeenCalledWith("b.ts");
  });

  it("点击关闭按钮触发关闭（不触发激活）", () => {
    const onActivate = vi.fn();
    const onClose = vi.fn();
    render(<TabsBar tabs={tabs} active="chat:/s/a.jsonl" onActivate={onActivate} onClose={onClose} onMove={vi.fn()} />);
    const closeBtns = screen.getAllByTitle("关闭 tab");
    fireEvent.click(closeBtns[2]); // b.ts 的关闭（0=chat, 1=a.ts, 2=b.ts）
    expect(onClose).toHaveBeenCalledWith("b.ts");
    expect(onActivate).not.toHaveBeenCalled();
  });

  it("聊天 tab 有关闭按钮（与 file 同级）", () => {
    render(<TabsBar tabs={tabs} active="chat:/s/a.jsonl" onActivate={vi.fn()} onClose={vi.fn()} onMove={vi.fn()} />);
    expect(screen.getAllByTitle("关闭 tab").length).toBe(3); // chat + 2 文件
  });
});

describe("TabsBar dirty 与保存", () => {
  afterEach(cleanup);

  const dirtyTabs: WorkspaceTab[] = [
    { kind: "chat", sessionId: "/s/a.jsonl", name: "聊天" },
    { kind: "file", path: "a.ts", name: "a.ts", dirty: true, preview: false },
  ];

  it("dirty 文件 tab 显示圆点（title=未保存）", () => {
    render(<TabsBar tabs={dirtyTabs} active="a.ts" onActivate={vi.fn()} onClose={vi.fn()} onMove={vi.fn()}  />);
    expect(screen.getByTitle("未保存")).toBeTruthy();
  });

  it("激活聊天时无保存按钮（tab 栏已无保存）", () => {
    render(<TabsBar tabs={dirtyTabs} active="chat" onActivate={vi.fn()} onClose={vi.fn()} onMove={vi.fn()} />);
    expect(screen.queryByText("保存")).toBeNull();
  });
});

describe("TabsBar 拖拽调序", () => {
  it("拖起 chat tab 放到 file tab → onMove(fromId, toId)", () => {
    const onMove = vi.fn();
    render(<TabsBar tabs={tabs} active="a.ts" onActivate={vi.fn()} onClose={vi.fn()} onMove={onMove} />);
    const from = screen.getByTitle("聊天");
    const to = screen.getByTitle("a.ts");
    fireEvent.dragStart(from, { dataTransfer: { effectAllowed: "" } });
    fireEvent.dragOver(to, { dataTransfer: {} });
    fireEvent.drop(to, { dataTransfer: {} });
    expect(onMove).toHaveBeenCalledWith("chat:/s/a.jsonl", "a.ts");
  });
});
