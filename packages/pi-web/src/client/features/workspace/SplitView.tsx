/**
 * 主区分区渲染（features/workspace/SplitView）——S2 seam。
 * 树 → 布局容器：split 节点 = row/col flex + divider；leaf 节点 = 叶子内容（App 提供 renderLeaf）+ 拖拽高亮层。
 * 拖拽：leaf 容器 dragover → resolveDropZone（归一化坐标，边缘/中央 join）→ 高亮；
 * drop → 边缘 onSplit(groupId, side, tabId)、中央 onJoin(groupId, tabId)。
 * R27：预览守卫——源组=目标组 且源组仅 1 tab 时不预览（拆分/并入均无意义）。
 */
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  MIN_SPLIT_RATIO,
  isMeaninglessSplit,
  resolveDropZone,
  type LayoutNode,
  type LeafNode,
  type SplitDir,
  type SplitSide,
  type SplitZone,
} from "@/entities/workspace";

export interface SplitViewProps {
  tree: LayoutNode;
  /** 拖拽中的 tab（TabsBar dragstart 上报；null = 无拖拽） */
  dragTabId: string | null;
  /** 叶子内容渲染（App 提供——TabsBar + chat/file/diff 内容区） */
  renderLeaf: (leaf: LeafNode) => ReactNode;
  /** drop 触发分区（边缘） */
  onSplit: (groupId: string, side: SplitSide, tabId: string) => void;
  /** R27：drop 到中央 → 并入目标组（join） */
  onJoin?: (groupId: string, tabId: string) => void;
  /** divider 拖动调整比例（05） */
  onRatio: (splitId: string, ratio: number) => void;
}

interface DropState {
  groupId: string;
  zone: SplitZone;
}

export function SplitView({ tree, dragTabId, renderLeaf, onSplit, onJoin, onRatio }: SplitViewProps) {
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
    // R27 守卫（与领域层 splitGroup 同一谓词）：源组=目标组 且 源组仅 1 tab → 不预览、drop 无效果
    if (isMeaninglessSplit(tree, dragRef.current, leaf.groupId)) {
      dropRef.current = null;
      setDrop((prev) => (prev ? null : prev));
      return;
    }
    const side = resolveDropZone(x, y);
    const next: DropState = { groupId: leaf.groupId, zone: side };
    dropRef.current = next;
    setDrop((prev) => (prev?.groupId === next.groupId && prev?.zone === next.zone ? prev : next));
  };

  const handleDrop = (leaf: LeafNode, e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    const target = dropRef.current;
    if (target && target.groupId === leaf.groupId && dragRef.current) {
      if (target.zone === "join") {
        onJoin?.(target.groupId, dragRef.current);
      } else {
        onSplit(target.groupId, target.zone, dragRef.current);
      }
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
          {drop && drop.groupId === node.groupId && <DropZone side={drop.zone} />}
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

/** 高亮层：边缘 = 实际拆分半区（R27：不再画 25% 命中区）；join = 整容器淡高亮 */
function DropZone({ side }: { side: SplitZone }) {
  const cls =
    side === "join"
      ? "inset-0"
      : side === "left"
        ? "inset-y-0 left-0 w-1/2"
        : side === "right"
          ? "inset-y-0 right-0 w-1/2"
          : side === "top"
            ? "inset-x-0 top-0 h-1/2"
            : "inset-x-0 bottom-0 h-1/2";
  // 08：base 不含 inset-y-0（否则 bottom 分支的 top:0 被它覆盖 → 高亮框显示在顶部）
  return <div data-testid={`drop-${side}`} className={`bg-primary/20 pointer-events-none absolute z-10 ${cls}`} />;
}
