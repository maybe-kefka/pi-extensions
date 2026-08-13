/**
 * 主区分区渲染（features/workspace/SplitView）——S2 seam。
 * 树 → 布局容器：split 节点 = row/col flex + divider；leaf 节点 = 叶子内容（App 提供 renderLeaf）+ 拖拽高亮层。
 * 拖拽：leaf 容器 dragover → resolveDropSide（归一化坐标）→ 高亮；drop → onSplit(groupId, side, tabId)。
 */
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { MIN_SPLIT_RATIO, resolveDropSide, type LayoutNode, type LeafNode, type SplitDir, type SplitSide } from "@/entities/workspace";

export interface SplitViewProps {
  tree: LayoutNode;
  /** 拖拽中的 tab（TabsBar dragstart 上报；null = 无拖拽） */
  dragTabId: string | null;
  /** 叶子内容渲染（App 提供——TabsBar + chat/file/diff 内容区） */
  renderLeaf: (leaf: LeafNode) => ReactNode;
  /** drop 触发分区 */
  onSplit: (groupId: string, side: SplitSide, tabId: string) => void;
  /** divider 拖动调整比例（05） */
  onRatio: (splitId: string, ratio: number) => void;
}

interface DropState {
  groupId: string;
  side: SplitSide;
}

export function SplitView({ tree, dragTabId, renderLeaf, onSplit, onRatio }: SplitViewProps) {
  const [drop, setDrop] = useState<DropState | null>(null);
  // divider 拖动中（05：pointer capture 期间）——ref 双写（pointermove 可能同帧）
  const [draggingSplit, setDraggingSplit] = useState<string | null>(null);
  const draggingRef = useRef<string | null>(null);
  // dragover 高频 setState；drop 事件可能同帧到达——ref 双写保证 drop 读到最新
  const dropRef = useRef<DropState | null>(null);
  const dragRef = useRef(dragTabId);
  dragRef.current = dragTabId;

  useEffect(() => {
    if (!dragTabId) {
      dropRef.current = null;
      setDrop(null);
    }
  }, [dragTabId]);

  const handleDragOver = (leaf: LeafNode, e: React.DragEvent<HTMLDivElement>): void => {
    if (!dragRef.current) return;
    e.preventDefault(); // 允许 drop
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    const side = resolveDropSide(x, y);
    // join（中央）暂不接——05 切片接入 join 高亮/drop；此前保持"中央无效果"现状
    const next: DropState | null = side && side !== "join" ? { groupId: leaf.groupId, side } : null;
    dropRef.current = next;
    setDrop((prev) => (prev?.groupId === next?.groupId && prev?.side === next?.side ? prev : next));
  };

  const handleDrop = (leaf: LeafNode, e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    const target = dropRef.current;
    if (target && target.groupId === leaf.groupId && dragRef.current) {
      onSplit(target.groupId, target.side, dragRef.current);
    }
    dropRef.current = null;
    setDrop(null);
  };

  // 05：divider 拖动（pointer capture）——clamp 到 [max(MIN, px/rect), 1-...]
  const handleDividerDown = (splitId: string, dir: SplitDir, e: React.PointerEvent<HTMLDivElement>): void => {
    e.preventDefault();
    draggingRef.current = splitId;
    setDraggingSplit(splitId);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* 合成事件无活动指针——忽略 */
    }
  };
  const handleDividerMove = (splitId: string, dir: SplitDir, e: React.PointerEvent<HTMLDivElement>): void => {
    if (draggingRef.current !== splitId) return;
    const rect = e.currentTarget.parentElement?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const raw = dir === "row" ? (e.clientX - rect.left) / rect.width : (e.clientY - rect.top) / rect.height;
    const minRatio = Math.max(MIN_SPLIT_RATIO, 160 / (dir === "row" ? rect.width : rect.height));
    onRatio(splitId, Math.min(1 - minRatio, Math.max(minRatio, raw)));
  };
  const handleDividerUp = (e: React.PointerEvent<HTMLDivElement>): void => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* 同上 */
    }
    draggingRef.current = null;
    setDraggingSplit(null);
  };

  const renderNode = (node: LayoutNode): ReactNode => {
    if (node.kind === "leaf") {
      return (
        <div
          data-testid={`leaf-${node.groupId}`}
          className="relative flex min-h-0 min-w-0 flex-1 flex-col"
          onDragOver={(e) => handleDragOver(node, e)}
          onDrop={(e) => handleDrop(node, e)}
        >
          {renderLeaf(node)}
          {drop && drop.groupId === node.groupId && <DropZone side={drop.side} />}
        </div>
      );
    }
    return (
      <div
        data-testid={`split-${node.dir}`}
        className={`flex min-h-0 min-w-0 flex-1 ${node.dir === "row" ? "flex-row" : "flex-col"}`}
      >
        <div className="flex min-h-0 min-w-0" style={{ flex: `0 1 ${node.ratio * 100}%` }}>
          {renderNode(node.a)}
        </div>
        <div
          data-testid="split-divider"
          className={`bg-border shrink-0 cursor-col-resize ${node.dir === "row" ? "w-px" : "h-px"}`}
          onPointerDown={(e) => handleDividerDown(node.id, node.dir, e)}
          onPointerMove={(e) => handleDividerMove(node.id, node.dir, e)}
          onPointerUp={handleDividerUp}
        />
        <div className="flex min-h-0 min-w-0" style={{ flex: `0 1 ${(1 - node.ratio) * 100}%` }}>
          {renderNode(node.b)}
        </div>
      </div>
    );
  };

  return <div className="flex min-h-0 min-w-0 flex-1 flex-col">{renderNode(tree)}</div>;
}

/** 十字高亮方向层（边缘四分之一区域） */
function DropZone({ side }: { side: SplitSide }) {
  const cls =
    side === "left"
      ? "inset-y-0 left-0 w-1/4"
      : side === "right"
        ? "inset-y-0 right-0 w-1/4"
        : side === "top"
          ? "inset-x-0 top-0 h-1/4"
          : "inset-x-0 bottom-0 h-1/4";
  // 08：base 不含 inset-y-0（否则 bottom 分支的 top:0 被它覆盖 → 高亮框显示在顶部）
  return <div data-testid={`drop-${side}`} className={`bg-primary/20 pointer-events-none absolute z-10 ${cls}`} />;
}
