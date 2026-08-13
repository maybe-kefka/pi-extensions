// @vitest-environment jsdom

/**
 * 主区分区渲染（features/workspace/SplitView）——S2 seam 测试。
 * 先例：TabsBar.test.tsx（jsdom fireEvent DnD + dataTransfer 桩）。
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SplitView } from "@/features/workspace";
import type { SplitViewProps } from "@/features/workspace";
import { initialTree, mapLeaf, openFile, singleLeafOf, splitGroup, type LayoutNode } from "@/entities/workspace";

/** 构造两 leaf 树：g1=[/a.ts, /b.ts]，split 后 /b.ts 在新组（side 决定方向）——原组留 /a.ts 不触发空合并 */
function twoLeafTree(side: "right" | "top" = "right"): LayoutNode {
  let tree = initialTree();
  const gid = singleLeafOf(tree).groupId;
  tree = mapLeaf(tree, gid, (leaf) => openFile(leaf, "/a.ts", "a.ts"));
  tree = mapLeaf(tree, gid, (leaf) => openFile(leaf, "/b.ts", "b.ts"));
  return splitGroup(tree, gid, side, "/b.ts");
}

function setup(partial: Partial<SplitViewProps> = {}) {
  const onSplit = vi.fn();
  const onRatio = vi.fn();
  const renderLeaf = vi.fn((leaf: { groupId: string }) => (
    <div data-testid={`content-${leaf.groupId}`}>leaf</div>
  ));
  const props: SplitViewProps = {
    tree: initialTree(),
    dragTabId: null,
    renderLeaf,
    onSplit,
    onRatio,
    ...partial,
  };
  return { ...props, renderLeaf, onSplit, onRatio, rerender: (p: Partial<SplitViewProps>) => render(<SplitView {...props} {...p} />) };
}

afterEach(cleanup);

/** jsdom 的 DragEvent 构造丢弃 clientX——用 MouseEvent 派发（React 按事件名匹配） */
function dragOverAt(el: HTMLElement, x: number, y: number) {
  fireEvent(
    el,
    new MouseEvent("dragover", { bubbles: true, cancelable: true, clientX: x, clientY: y }),
  );
}

function mockRect(width: number, height: number, x = 0, y = 0) {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    width, height, x, y, top: y, left: x, right: x + width, bottom: y + height,
    toJSON: () => ({}),
  } as DOMRect);
}

describe("SplitView 02：分区渲染与拖拽", () => {
  it("单 leaf：渲染叶子内容一次", () => {
    const s = setup();
    render(<SplitView {...s} />);
    expect(s.renderLeaf).toHaveBeenCalledTimes(1);
  });

  it("row split：两个 leaf + divider，row 容器", () => {
    const s = setup({ tree: twoLeafTree() });
    render(<SplitView {...s} />);
    expect(s.renderLeaf).toHaveBeenCalledTimes(2);
    expect(document.querySelector('[data-testid="split-row"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="split-divider"]')).not.toBeNull();
  });

  it("col split：col 容器", () => {
    const s = setup({ tree: twoLeafTree("top") });
    render(<SplitView {...s} />);
    expect(document.querySelector('[data-testid="split-col"]')).not.toBeNull();
  });

  it("dragover 右缘 + drop：触发 onSplit(groupId, right, tabId) 并显示高亮", () => {
    mockRect(400, 300);
    const s = setup({
      tree: twoLeafTree(),
      dragTabId: "chat:/s.jsonl",
    });
    render(<SplitView {...s} />);
    // 命中左侧原组 leaf（a 侧）——dragover 右缘
    const aLeaf = screen.getByTestId("leaf-g1");
    dragOverAt(aLeaf, 380, 150);
    expect(document.querySelector('[data-testid="drop-right"]')).not.toBeNull();
    fireEvent.drop(aLeaf, { clientX: 380, clientY: 150 });
    expect(s.onSplit).toHaveBeenCalledWith("g1", "right", "chat:/s.jsonl");
  });

  it("dragover 中央：join 高亮（整容器），drop 触发 onJoin 并入目标组", () => {
    mockRect(400, 300);
    const s = setup({
      tree: twoLeafTree(),
      dragTabId: "chat:/s.jsonl",
      onJoin: vi.fn(),
    });
    render(<SplitView {...s} />);
    dragOverAt(screen.getByTestId("leaf-g1"), 200, 150);
    expect(document.querySelector('[data-testid="drop-join"]')).not.toBeNull();
    fireEvent.drop(screen.getByTestId("leaf-g1"), { clientX: 200, clientY: 150 });
    expect(s.onJoin).toHaveBeenCalledWith("g1", "chat:/s.jsonl");
    expect(s.onSplit).not.toHaveBeenCalled();
  });

  it("R27 守卫：源组=目标组 且仅 1 tab → 无高亮、drop 无效果", () => {
    mockRect(400, 300);
    let tree = initialTree();
    const gid = singleLeafOf(tree).groupId;
    tree = mapLeaf(tree, gid, (leaf) => openFile(leaf, "/a.ts", "a.ts"));
    const s = setup({ tree, dragTabId: "/a.ts", onJoin: vi.fn() });
    render(<SplitView {...s} />);
    // 自身组右缘 / 中央均不预览
    dragOverAt(screen.getByTestId("leaf-g1"), 380, 150);
    expect(document.querySelector('[data-testid^="drop-"]')).toBeNull();
    dragOverAt(screen.getByTestId("leaf-g1"), 200, 150);
    expect(document.querySelector('[data-testid^="drop-"]')).toBeNull();
    fireEvent.drop(screen.getByTestId("leaf-g1"), { clientX: 380, clientY: 150 });
    expect(s.onSplit).not.toHaveBeenCalled();
    expect(s.onJoin).not.toHaveBeenCalled();
  });

  it("R27 跨组拖拽：拖 g1 的 tab 到另一组边缘 → onSplit(目标组, side, tab)（01 领域层跨组语义）", () => {
    mockRect(400, 300);
    const tree = twoLeafTree();
    const freshId = tree.kind === "split" && tree.b.kind === "leaf" ? tree.b.groupId : "w1";
    const s = setup({ tree, dragTabId: "/a.ts", onJoin: vi.fn() });
    render(<SplitView {...s} />);
    const bLeaf = screen.getByTestId(`leaf-${freshId}`);
    dragOverAt(bLeaf, 380, 150);
    expect(document.querySelector('[data-testid="drop-right"]')).not.toBeNull();
    fireEvent.drop(bLeaf, { clientX: 380, clientY: 150 });
    expect(s.onSplit).toHaveBeenCalledWith(freshId, "right", "/a.ts");
  });

  it("R27 边缘高亮 = 实际半区（w-1/2，非命中区 w-1/4）", () => {
    mockRect(400, 300);
    const s = setup({ tree: twoLeafTree(), dragTabId: "chat:/s.jsonl" });
    render(<SplitView {...s} />);
    dragOverAt(screen.getByTestId("leaf-g1"), 380, 150);
    const zone = document.querySelector('[data-testid="drop-right"]');
    expect(zone).not.toBeNull();
    const cls = zone?.getAttribute("class") ?? "";
    expect(cls).toContain("w-1/2");
    expect(cls).not.toContain("w-1/4");
  });

  it("无拖拽中的 tab：dragover 无高亮", () => {
    mockRect(400, 300);
    const s = setup({ tree: twoLeafTree(), dragTabId: null });
    render(<SplitView {...s} />);
    dragOverAt(screen.getByTestId("leaf-g1"), 380, 150);
    expect(document.querySelector('[data-testid^="drop-"]')).toBeNull();
  });

  it("拖拽结束（dragTabId → null）：高亮清除", () => {
    mockRect(400, 300);
    const s = setup({
      tree: twoLeafTree(),
      dragTabId: "chat:/s.jsonl",
    });
    const { rerender } = render(<SplitView {...s} />);
    dragOverAt(screen.getByTestId("leaf-g1"), 380, 150);
    expect(document.querySelector('[data-testid="drop-right"]')).not.toBeNull();
    rerender(<SplitView {...s} dragTabId={null} />);
    expect(document.querySelector('[data-testid^="drop-"]')).toBeNull();
  });


describe("SplitView 05：divider 拖动", () => {
  it("pointer 拖动 divider：实时回调 onRatio（clamp 后比例）", () => {
    mockRect(800, 600);
    const s = setup({ tree: twoLeafTree() });
    render(<SplitView {...s} />);
    const divider = document.querySelector('[data-testid="split-divider"]') as HTMLElement;
    fireEvent.pointerDown(divider, { pointerId: 1, clientX: 400, clientY: 300 });
    fireEvent.pointerMove(divider, { pointerId: 1, clientX: 200, clientY: 300 });
    // 200/800 = 0.25（在 [0.2, 0.8] 内）
    expect(s.onRatio).toHaveBeenCalledWith(expect.any(String), 0.25);
    fireEvent.pointerUp(divider, { pointerId: 1 });
  });

  it("拖动到边缘：clamp 到最小/最大比例", () => {
    mockRect(800, 600);
    const s = setup({ tree: twoLeafTree() });
    render(<SplitView {...s} />);
    const divider = document.querySelector('[data-testid="split-divider"]') as HTMLElement;
    fireEvent.pointerDown(divider, { pointerId: 1, clientX: 400, clientY: 300 });
    fireEvent.pointerMove(divider, { pointerId: 1, clientX: 5, clientY: 300 });
    expect(s.onRatio).toHaveBeenLastCalledWith(expect.any(String), 0.2);
    fireEvent.pointerUp(divider, { pointerId: 1 });
  });
});

describe("SplitView 08：bug 修复回归", () => {
  it("DropZone bottom 方向：高亮框底部对齐（不含 inset-y-0 覆盖）", () => {
    mockRect(400, 300);
    const s = setup({ tree: twoLeafTree(), dragTabId: "chat:/s.jsonl" });
    render(<SplitView {...s} />);
    // 左侧原组 leaf 底部 dragover → bottom 高亮
    dragOverAt(screen.getByTestId("leaf-g1"), 200, 295);
    const zone = document.querySelector('[data-testid="drop-bottom"]');
    expect(zone).not.toBeNull();
    const cls = zone?.getAttribute("class") ?? "";
    expect(cls).toContain("bottom-0");
    expect(cls).not.toContain("inset-y-0");
  });
});
});
