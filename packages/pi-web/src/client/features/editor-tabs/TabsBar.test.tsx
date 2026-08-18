// @vitest-environment jsdom
// TabsBar 渲染测试：文件/聊天 tab、激活高亮、关闭按钮
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TabsBar } from "./TabsBar";
import type { WorkspaceTab } from "@/entities/workspace";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** jsdom 无布局——mock rect：drop target = [0,300)；tab 按 title（聊天/a.ts/b.ts）= 每 100px 一个 */
function mockTabRects() {
  const byTitle: Record<string, { left: number; width: number }> = {
    聊天: { left: 0, width: 100 },
    "a.ts": { left: 100, width: 100 },
    "b.ts": { left: 200, width: 100 },
  };
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const base = { top: 0, right: 0, bottom: 0, x: 0, y: 0, height: 0, toJSON: () => ({}) } as DOMRect;
    if (this.getAttribute?.("data-slot") === "tab-drop-target") return { ...base, left: 0, width: 300, right: 300 } as DOMRect;
    const label = this.getAttribute?.("title") ?? "";
    const r = byTitle[label];
    if (r) return { ...base, left: r.left, width: r.width, right: r.left + r.width } as DOMRect;
    return { ...base, left: 0, width: 0 } as DOMRect;
  });
}

/** jsdom 的 DragEvent 构造丢弃 clientX——用 MouseEvent 派发（React 按事件名匹配，SplitView 测试同模式） */
function dragOverAt(el: HTMLElement, x: number) {
  fireEvent(el, new MouseEvent("dragover", { bubbles: true, cancelable: true, clientX: x }));
}

const tabs: WorkspaceTab[] = [
  { kind: "chat", sessionId: "/s/a.jsonl", name: "聊天" },
  { kind: "file", path: "a.ts", name: "a.ts", dirty: false, preview: false },
  { kind: "file", path: "b.ts", name: "b.ts", dirty: false, preview: false },
];

describe("TabsBar", () => {
  it("空 workspace 不渲染无子项的 tablist", () => {
    render(<TabsBar tabs={[]} active="" onActivate={vi.fn()} onClose={vi.fn()} onMove={vi.fn()} />);
    expect(screen.queryByRole("tablist")).toBeNull();
  });

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
    const closeBtns = container.querySelectorAll('[title="关闭 tab"]');
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

  it("tablist 的直接子项全部是可激活 tab", () => {
    render(<TabsBar tabs={tabs} active="a.ts" onActivate={vi.fn()} onClose={vi.fn()} onMove={vi.fn()} />);
    const tablist = screen.getByRole("tablist", { name: "工作区标签" });
    expect(Array.from(tablist.children).filter((child) => child.getAttribute("role") === "tab")).toHaveLength(tabs.length);
  });

  it("点击 tab 触发激活", () => {
    const onActivate = vi.fn();
    render(<TabsBar tabs={tabs} active="chat" onActivate={onActivate} onClose={vi.fn()} onMove={vi.fn()}  />);
    fireEvent.click(screen.getByText("b.ts"));
    expect(onActivate).toHaveBeenCalledWith("b.ts");
  });

  it("tab 键盘导航支持 Home/End 与左右循环，并激活目标", () => {
    const onActivate = vi.fn();
    render(<TabsBar tabs={tabs} active="a.ts" onActivate={onActivate} onClose={vi.fn()} onMove={vi.fn()} />);
    const current = screen.getByRole("tab", { name: "a.ts" });
    const first = screen.getByRole("tab", { name: "聊天" });
    const next = screen.getByRole("tab", { name: "b.ts" });
    expect(current.getAttribute("tabIndex")).toBe("0");
    expect(next.getAttribute("tabIndex")).toBe("-1");

    fireEvent.keyDown(current, { key: "Home" });
    expect(onActivate).toHaveBeenCalledWith("chat:/s/a.jsonl");
    expect(document.activeElement).toBe(first);

    current.focus();
    fireEvent.keyDown(current, { key: "End" });
    expect(onActivate).toHaveBeenCalledWith("b.ts");
    expect(document.activeElement).toBe(next);

    fireEvent.keyDown(next, { key: "ArrowLeft" });
    expect(onActivate).toHaveBeenLastCalledWith("a.ts");
    expect(document.activeElement).toBe(current);
    fireEvent.keyDown(current, { key: "ArrowRight" });
    expect(onActivate).toHaveBeenLastCalledWith("b.ts");
    expect(document.activeElement).toBe(next);
    fireEvent.keyDown(next, { key: "ArrowRight" });
    expect(onActivate).toHaveBeenLastCalledWith("chat:/s/a.jsonl");
    expect(document.activeElement).toBe(first);
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

  it("焦点在 tab 上时按 Delete 关闭当前 tab", () => {
    const onClose = vi.fn();
    render(<TabsBar tabs={tabs} active="a.ts" onActivate={vi.fn()} onClose={onClose} onMove={vi.fn()} />);
    const current = screen.getByRole("tab", { name: "a.ts" });

    current.focus();
    fireEvent.keyDown(current, { key: "Delete" });

    expect(onClose).toHaveBeenCalledWith("a.ts");
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
  it("拖起 chat tab 放到 file tab 左半 → onMove(fromId, toId)", () => {
    mockTabRects();
    const onMove = vi.fn();
    render(<TabsBar tabs={tabs} active="a.ts" onActivate={vi.fn()} onClose={vi.fn()} onMove={onMove} />);
    const from = screen.getByTitle("聊天");
    const to = screen.getByTitle("a.ts");
    fireEvent.dragStart(from, { dataTransfer: { effectAllowed: "" } });
    dragOverAt(to, 110); // a.ts 左半
    fireEvent.drop(to);
    expect(onMove).toHaveBeenCalledWith("chat:/s/a.jsonl", "a.ts");
  });

  it("外部拖拽（dragId）：跨组 drop 到 tab 左半 → onMove(fromId, toId)", () => {
    mockTabRects();
    const onMove = vi.fn();
    render(<TabsBar tabs={tabs} active="a.ts" onActivate={vi.fn()} onClose={vi.fn()} onMove={onMove} dragId="chat:/other.jsonl" />);
    const to = screen.getByTitle("a.ts");
    dragOverAt(to, 110); // a.ts 左半
    fireEvent.drop(to);
    expect(onMove).toHaveBeenCalledWith("chat:/other.jsonl", "a.ts");
  });

  it("drop 到 tab 右半 → 插到下一个 tab 前（onMove 到 next）", () => {
    mockTabRects();
    const onMove = vi.fn();
    render(<TabsBar tabs={tabs} active="a.ts" onActivate={vi.fn()} onClose={vi.fn()} onMove={onMove} dragId="chat:/other.jsonl" />);
    const to = screen.getByTitle("a.ts");
    dragOverAt(to, 190); // a.ts 右半
    fireEvent.drop(to);
    expect(onMove).toHaveBeenCalledWith("chat:/other.jsonl", "b.ts");
  });

  it("drop 到末尾空白 → onDropTab(fromId)（追加末尾）", () => {
    mockTabRects();
    const onDropTab = vi.fn();
    render(<TabsBar tabs={tabs} active="a.ts" onActivate={vi.fn()} onClose={vi.fn()} onMove={vi.fn()} onDropTab={onDropTab} dragId="chat:/other.jsonl" />);
    const tablist = screen.getByRole("tablist");
    dragOverAt(tablist, 320); // 最后 tab 右缘之后
    fireEvent.drop(tablist);
    expect(onDropTab).toHaveBeenCalledWith("chat:/other.jsonl");
  });

  it("外部拖拽（dragId）：drop 到空栏 → onDropTab(fromId)", () => {
    const onDropTab = vi.fn();
    const { container } = render(<TabsBar tabs={[]} active="" onActivate={vi.fn()} onClose={vi.fn()} onMove={vi.fn()} onDropTab={onDropTab} dragId="chat:/other.jsonl" />);
    const dropTarget = container.querySelector('[data-slot="tab-drop-target"]') as HTMLElement;
    fireEvent.dragOver(dropTarget, { dataTransfer: {} });
    fireEvent.drop(dropTarget, { dataTransfer: {} });
    expect(onDropTab).toHaveBeenCalledWith("chat:/other.jsonl");
  });

});
