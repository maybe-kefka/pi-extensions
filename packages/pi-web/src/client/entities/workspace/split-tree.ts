/**
 * 递归分区树（entities/workspace/split-tree）——S1 seam 主模块。
 * 树 = Split(dir, ratio, a, b) | Leaf(groupId, tabs, active)；叶子内操作复用 tabs.ts（WorkspaceState 兼容）。
 * 单组 = 单 leaf（与旧扁平 WorkspaceState 语义等价）。
 */
import { closeTab } from "./tabs";
import type { WorkspaceState, WorkspaceTab } from "./tabs";

export type SplitDir = "row" | "col";

export type LeafNode = { kind: "leaf"; groupId: string; tabs: WorkspaceTab[]; active: string };

export type SplitNode = { kind: "split"; id: string; dir: SplitDir; ratio: number; a: LayoutNode; b: LayoutNode };

export type LayoutNode = SplitNode | LeafNode;

/** 初始：单个空 leaf（groupId 固定 g1——单组模式） */
export function initialTree(): LayoutNode {
  return { kind: "leaf", groupId: "g1", tabs: [], active: "" };
}

/** 树中第一个 leaf（单组模式的叶子内容；多组时取第一个——由调用方保证语义） */
export function singleLeafOf(tree: LayoutNode): LeafNode {
  if (tree.kind === "leaf") return tree;
  return singleLeafOf(tree.a);
}

/** 按 groupId 定位 leaf，应用 fn（返回 {tabs, active}——groupId 由本模块恢复），不可变回写；不存在 → 原树 */
export function mapLeaf(
  tree: LayoutNode,
  groupId: string,
  fn: (leaf: WorkspaceState & { groupId: string }) => WorkspaceState,
): LayoutNode {
  if (tree.kind === "leaf") {
    if (tree.groupId !== groupId) return tree;
    return { ...fn(tree), kind: "leaf", groupId };
  }
  const a = mapLeaf(tree.a, groupId, fn);
  const b = mapLeaf(tree.b, groupId, fn);
  if (a === tree.a && b === tree.b) return tree;
  return { ...tree, a, b };
}

/** 按 groupId 定位 leaf 并整体替换（fn 可返回任意节点——分区用）；不存在 → 原树 */
export function updateLeaf(tree: LayoutNode, groupId: string, fn: (leaf: LeafNode) => LayoutNode): LayoutNode {
  if (tree.kind === "leaf") {
    if (tree.groupId !== groupId) return tree;
    return fn(tree);
  }
  const a = updateLeaf(tree.a, groupId, fn);
  const b = updateLeaf(tree.b, groupId, fn);
  if (a === tree.a && b === tree.b) return tree;
  return { ...tree, a, b };
}

export type SplitSide = "left" | "right" | "top" | "bottom";

let idSeq = 0;
const nextId = (): string => `w${++idSeq}`;

/** 拖拽分区：目标 leaf 一分为二，被拖 tab 移入新组（新组初始只有它自己）；原组移除该 tab（激活相邻） */
export function splitGroup(tree: LayoutNode, groupId: string, side: SplitSide, tabId: string): LayoutNode {
  return updateLeaf(tree, groupId, (leaf) => {
    const idx = leaf.tabs.findIndex((t) => tabKeyOf(t) === tabId);
    if (idx === -1) return leaf;
    const [moved] = leaf.tabs.slice(idx, idx + 1);
    const rest = leaf.tabs.filter((_, i) => i !== idx);
    // 原组激活处理复用 closeTab 语义（移除后激活相邻）——补回 kind/groupId（closeTab 只返回 {tabs,active}）
    const remain: LeafNode = { ...closeTab({ ...leaf, tabs: rest }, tabId), kind: "leaf", groupId: leaf.groupId };
    const fresh: LeafNode = { kind: "leaf", groupId: nextId(), tabs: [moved], active: tabId };
    const dir: SplitDir = side === "left" || side === "right" ? "row" : "col";
    const a = side === "left" || side === "top" ? fresh : remain;
    const b = side === "left" || side === "top" ? remain : fresh;
    return { kind: "split", id: nextId(), dir, ratio: 0.5, a, b };
  });
}

function tabKeyOf(t: WorkspaceTab): string {
  return t.kind === "file" ? t.path : t.kind === "diff" ? `diff:${t.path}` : `chat:${t.sessionId}`;
}

/** 十字高亮方向判定：归一化坐标（0-1，相对目标 leaf 容器）→ 四向边缘 / 中央 null */
export function resolveDropSide(x: number, y: number): SplitSide | null {
  const EDGE = 0.25;
  if (x < EDGE) return "left";
  if (x > 1 - EDGE) return "right";
  if (y < EDGE) return "top";
  if (y > 1 - EDGE) return "bottom";
  return null;
}

const SERIALIZE_VERSION = 1;

/** 树 → JSON（版本化） */
export function serializeTree(tree: LayoutNode): string {
  return JSON.stringify({ v: SERIALIZE_VERSION, tree });
}

/** JSON → 树；损坏/旧格式 → 初始空树（兜底） */
export function deserializeTree(json: string): LayoutNode {
  try {
    const data: unknown = JSON.parse(json);
    if (isValidData(data)) return data.tree;
  } catch {
    /* 损坏 → 兜底 */
  }
  return initialTree();
}

function isValidData(data: unknown): data is { v: number; tree: LayoutNode } {
  if (typeof data !== "object" || data === null) return false;
  const d = data as { v?: unknown; tree?: unknown };
  return d.v === SERIALIZE_VERSION && isValidNode(d.tree);
}

function isValidNode(node: unknown): node is LayoutNode {
  if (typeof node !== "object" || node === null) return false;
  const n = node as { kind?: unknown };
  if (n.kind === "leaf") {
    const l = node as { groupId?: unknown; tabs?: unknown; active?: unknown };
    return typeof l.groupId === "string" && Array.isArray(l.tabs) && typeof l.active === "string";
  }
  if (n.kind === "split") {
    const s = node as { id?: unknown; dir?: unknown; ratio?: unknown; a?: unknown; b?: unknown };
    return (
      typeof s.id === "string" &&
      (s.dir === "row" || s.dir === "col") &&
      typeof s.ratio === "number" &&
      s.ratio > 0 &&
      s.ratio < 1 &&
      isValidNode(s.a) &&
      isValidNode(s.b)
    );
  }
  return false;
}
