// @vitest-environment jsdom
// TabsBar 渲染测试：文件/聊天 tab、激活高亮、关闭按钮
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TabsBar } from "./TabsBar";
import type { WorkspaceTab } from "@/entities/workspace/tabs";

afterEach(cleanup);

const tabs: WorkspaceTab[] = [
  { kind: "chat", processId: "host", name: "聊天" },
  { kind: "file", path: "a.ts", name: "a.ts", dirty: false, preview: false },
  { kind: "file", path: "b.ts", name: "b.ts", dirty: false, preview: false },
];

describe("TabsBar", () => {
  it("渲染聊天 tab（tab.name 标签）与文件 tab", () => {
    render(<TabsBar tabs={tabs} active="chat:host" sessionName="pi-web 开发" onActivate={vi.fn()} onClose={vi.fn()} onSave={vi.fn()} onNewChat={vi.fn()} />);
    expect(screen.getByText("聊天")).toBeTruthy();
    expect(screen.getByText("a.ts")).toBeTruthy();
    expect(screen.getByText("b.ts")).toBeTruthy();
  });

  it("宿主 chat tab 无关闭钮；普通 chat tab 可关；新建会话按钮触发 onNewChat", () => {
    const onClose = vi.fn();
    const onNewChat = vi.fn();
    const { container } = render(
      <TabsBar
        tabs={[
          { kind: "chat", processId: "host", name: "聊天" },
          { kind: "chat", processId: "p-1", name: "会话B" },
        ]}
        active="chat:host"
        sessionName="s"
        onActivate={vi.fn()}
        onClose={onClose}
        onSave={vi.fn()}
        onNewChat={onNewChat}
      />,
    );
    const hostTab = container.querySelector('[role="tab"]');
    expect(hostTab?.querySelector('button[title="关闭 tab"]')).toBeNull();
    const p1Tab = container.querySelectorAll('[role="tab"]')[1];
    fireEvent.click(p1Tab.querySelector('button[title="关闭 tab"]')!);
    expect(onClose).toHaveBeenCalledWith("chat:p-1");
    fireEvent.click(screen.getByText("新建会话"));
    expect(onNewChat).toHaveBeenCalled();
  });

  it("激活 tab 高亮（aria-selected）", () => {
    const { container } = render(
      <TabsBar tabs={tabs} active="a.ts" sessionName="s" onActivate={vi.fn()} onClose={vi.fn()} onSave={vi.fn()} onNewChat={vi.fn()} />,
    );
    const active = container.querySelector('[aria-selected="true"]');
    expect(active?.textContent).toContain("a.ts");
  });

  it("点击 tab 触发激活", () => {
    const onActivate = vi.fn();
    render(<TabsBar tabs={tabs} active="chat" sessionName="s" onActivate={onActivate} onClose={vi.fn()} onSave={vi.fn()} onNewChat={vi.fn()} />);
    fireEvent.click(screen.getByText("b.ts"));
    expect(onActivate).toHaveBeenCalledWith("b.ts");
  });

  it("点击关闭按钮触发关闭（不触发激活）", () => {
    const onActivate = vi.fn();
    const onClose = vi.fn();
    render(<TabsBar tabs={tabs} active="chat" sessionName="s" onActivate={onActivate} onClose={onClose} onSave={vi.fn()} onNewChat={vi.fn()} />);
    const closeBtns = screen.getAllByTitle("关闭 tab");
    fireEvent.click(closeBtns[1]); // b.ts 的关闭
    expect(onClose).toHaveBeenCalledWith("b.ts");
    expect(onActivate).not.toHaveBeenCalled();
  });

  it("聊天 tab 无关闭按钮", () => {
    render(<TabsBar tabs={tabs} active="chat" sessionName="s" onActivate={vi.fn()} onClose={vi.fn()} onSave={vi.fn()} onNewChat={vi.fn()} />);
    expect(screen.getAllByTitle("关闭 tab")).toHaveLength(2); // 仅文件 tab
  });
});

describe("TabsBar dirty 与保存", () => {
  afterEach(cleanup);

  const dirtyTabs: WorkspaceTab[] = [
    { kind: "chat", processId: "host", name: "聊天" },
    { kind: "file", path: "a.ts", name: "a.ts", dirty: true, preview: false },
  ];

  it("dirty 文件 tab 显示圆点（title=未保存）", () => {
    render(<TabsBar tabs={dirtyTabs} active="a.ts" sessionName="s" onActivate={vi.fn()} onClose={vi.fn()} onSave={vi.fn()} onNewChat={vi.fn()} />);
    expect(screen.getByTitle("未保存")).toBeTruthy();
  });

  it("激活文件 dirty 时显示保存按钮；点击触发 onSave", () => {
    const onSave = vi.fn();
    render(<TabsBar tabs={dirtyTabs} active="a.ts" sessionName="s" onActivate={vi.fn()} onClose={vi.fn()} onSave={onSave} onNewChat={vi.fn()} />);
    fireEvent.click(screen.getByText("保存"));
    expect(onSave).toHaveBeenCalled();
  });

  it("激活文件不脏或激活聊天时无保存按钮", () => {
    render(<TabsBar tabs={dirtyTabs} active="chat" sessionName="s" onActivate={vi.fn()} onClose={vi.fn()} onSave={vi.fn()} onNewChat={vi.fn()} />);
    expect(screen.queryByText("保存")).toBeNull();
  });
});
