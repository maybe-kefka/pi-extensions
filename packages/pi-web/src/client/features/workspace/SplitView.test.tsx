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
  const renderLeaf = vi.fn((leaf: { groupId: string }) => (
    <div data-testid={`content-${leaf.groupId}`}>leaf</div>
  ));
  const props: SplitViewProps = {
    tree: initialTree(),
    dragTabId: null,
    renderLeaf,
    onSplit,
    ...partial,
  };
  return { ...props, renderLeaf, onSplit, rerender: (p: Partial<SplitViewProps>) => render(<SplitView {...props} {...p} />) };
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

  it("dragover 中央：无高亮，drop 不触发", () => {
    mockRect(400, 300);
    const s = setup({
      tree: twoLeafTree(),
      dragTabId: "chat:/s.jsonl",
    });
    render(<SplitView {...s} />);
    dragOverAt(screen.getByTestId("leaf-g1"), 200, 150);
    expect(document.querySelector('[data-testid^="drop-"]')).toBeNull();
    fireEvent.drop(screen.getByTestId("leaf-g1"), { clientX: 200, clientY: 150 });
    expect(s.onSplit).not.toHaveBeenCalled();
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

});
