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

/** 拖拽分区：把 tab（可在任意组）拆到目标组——目标 leaf 一分为二，tab 移入新组（新组初始只有它自己）；
 *  同组：原组移除该 tab（激活相邻）；跨组：先从源组移除（激活相邻）再拆目标组；空组自动回收。
 *  守卫：源组 = 目标组 且仅 1 个 tab → 原树不变（无意义拆分）。 */
export function splitGroup(tree: LayoutNode, toGroupId: string, side: SplitSide, tabId: string): LayoutNode {
  const fromGroupId = findGroupOf(tree, tabId);
  if (!fromGroupId) return tree;
  if (!findLeaf(tree, toGroupId)) return tree; // 目标组不存在 → 原树（先校验再移除，避免半应用）
  // 守卫：源=目标 且 源组仅 1 tab → 拆分无意义（拖走即空 → 回收）
  if (fromGroupId === toGroupId) {
    const src = findLeaf(tree, fromGroupId);
    if (src && src.tabs.length <= 1) return tree;
  }
  // 跨组：先从源组移除（复用 closeTab 语义激活相邻）
  let movedTab: WorkspaceTab | null = null;
  let base = tree;
  if (fromGroupId !== toGroupId) {
    base = updateLeaf(tree, fromGroupId, (leaf) => {
      const idx = leaf.tabs.findIndex((t) => tabKeyOf(t) === tabId);
      const moved = leaf.tabs[idx];
      if (idx === -1 || !moved) return leaf;
      movedTab = moved;
      return { ...closeTab(leaf, tabId), kind: "leaf", groupId: leaf.groupId };
    });
    if (!movedTab) return tree;
  }
  // 目标组一分为二：原组激活处理复用 closeTab 语义（用完整 leaf——内部按原 tabs 定位 idx 才能正确激活相邻；
  // 传移除后的 rest 会导致 idx=-1 → active 被清空（chat 丢聚焦）
  const result = updateLeaf(base, toGroupId, (leaf) => {
    const idx = leaf.tabs.findIndex((t) => tabKeyOf(t) === tabId);
    const moved = movedTab ?? (idx !== -1 ? leaf.tabs[idx] : null);
    if (!moved) return leaf;
    const remain: LeafNode =
      fromGroupId === toGroupId
        ? { ...closeTab(leaf, tabId), kind: "leaf", groupId: leaf.groupId }
        : leaf;
    const fresh: LeafNode = { kind: "leaf", groupId: nextId(), tabs: [moved], active: tabId };
    const dir: SplitDir = side === "left" || side === "right" ? "row" : "col";
    const a = side === "left" || side === "top" ? fresh : remain;
    const b = side === "left" || side === "top" ? remain : fresh;
    return removeEmptyLeaf({ kind: "split", id: nextId(), dir, ratio: 0.5, a, b });
  });
  return removeEmptyLeaf(result);
}

/** tab 唯一标识（与 TabsBar 的 id 派生一致）——review：去重 */
export function tabKeyOf(t: WorkspaceTab): string {
  return t.kind === "file" ? t.path : t.kind === "diff" ? `diff:${t.path}` : `chat:${t.sessionId}`;
}

/** 空 leaf 自动合并：内部空组提升兄弟，递归到单 leaf（根不空） */
export function removeEmptyLeaf(tree: LayoutNode): LayoutNode {
  if (tree.kind === "leaf") return tree;
  const a = removeEmptyLeaf(tree.a);
  const b = removeEmptyLeaf(tree.b);
  const aEmpty = a.kind === "leaf" && a.tabs.length === 0;
  const bEmpty = b.kind === "leaf" && b.tabs.length === 0;
  if (aEmpty && bEmpty) return { kind: "leaf", groupId: a.kind === "leaf" ? a.groupId : b.kind === "leaf" ? b.groupId : "g1", tabs: [], active: "" };
  if (aEmpty) return b;
  if (bEmpty) return a;
  return { ...tree, a, b };
}

function findGroupOf(tree: LayoutNode, tabId: string): string | null {
  if (tree.kind === "leaf") return tree.tabs.some((t) => tabKeyOf(t) === tabId) ? tree.groupId : null;
  return findGroupOf(tree.a, tabId) ?? findGroupOf(tree.b, tabId);
}

/** 导出版（04：按 tab 定位组——agent 生命周期/改名等外部操作） */
export function findGroupOfTree(tree: LayoutNode, tabId: string): string | null {
  return findGroupOf(tree, tabId);
}

/** 按 groupId 找 leaf（聚焦区定位）；不存在 → null */
export function findLeaf(tree: LayoutNode, groupId: string): LeafNode | null {
  if (tree.kind === "leaf") return tree.groupId === groupId ? tree : null;
  return findLeaf(tree.a, groupId) ?? findLeaf(tree.b, groupId);
}

/** 展平所有组的 tabs（agent 生命周期等全局查找用） */
export function flattenTabs(tree: LayoutNode): WorkspaceTab[] {
  if (tree.kind === "leaf") return tree.tabs;
  return [...flattenTabs(tree.a), ...flattenTabs(tree.b)];
}

export const MIN_SPLIT_RATIO = 0.2;

/** 调整 split 比例（clamp 到 [minRatio, 1-minRatio]）；不存在的 splitId → 原树 */
export function setSplitRatio(tree: LayoutNode, splitId: string, ratio: number, minRatio: number = MIN_SPLIT_RATIO): LayoutNode {
  if (tree.kind === "leaf") return tree;
  if (tree.id === splitId) {
    const r = Math.min(1 - minRatio, Math.max(minRatio, ratio));
    return r === tree.ratio ? tree : { ...tree, ratio: r };
  }
  const a = setSplitRatio(tree.a, splitId, ratio, minRatio);
  const b = setSplitRatio(tree.b, splitId, ratio, minRatio);
  if (a === tree.a && b === tree.b) return tree;
  return { ...tree, a, b };
}

/** 从所在组移除 tab（不指定组——内部定位）；组空自动合并 */
export function removeTabFromTree(tree: LayoutNode, tabId: string): LayoutNode {
  const groupId = findGroupOf(tree, tabId);
  if (!groupId) return tree;
  const removed = updateLeaf(tree, groupId, (leaf) =>
    leaf.tabs.some((t) => tabKeyOf(t) === tabId)
      ? { ...closeTab(leaf, tabId), kind: "leaf", groupId: leaf.groupId }
      : leaf,
  );
  return removeEmptyLeaf(removed);
}

/** 移动 tab 到目标组（跨组/同组调序统一）：toId 前插入（null = 追加末尾）；跨组激活目标、原组激活相邻；空组自动合并 */
export function moveTabToGroup(tree: LayoutNode, toGroupId: string, fromId: string, toId: string | null): LayoutNode {
  const fromGroupId = findGroupOf(tree, fromId);
  if (!fromGroupId) return tree;
  if (fromGroupId === toGroupId) {
    // 同组：调序/移至末尾（激活不变）
    return updateLeaf(tree, toGroupId, (leaf) => {
      const idx = leaf.tabs.findIndex((t) => tabKeyOf(t) === fromId);
      const moved = leaf.tabs[idx];
      if (idx === -1 || !moved) return leaf;
      const rest = leaf.tabs.filter((_, i) => i !== idx);
      const toIdx = toId ? leaf.tabs.findIndex((t) => tabKeyOf(t) === toId) : -1;
      const tabs = toId && toIdx !== -1 ? [...rest.slice(0, toIdx), moved, ...rest.slice(toIdx)] : [...rest, moved];
      return { ...leaf, tabs };
    });
  }
  // 跨组：先移除（激活相邻）再插入（激活目标）
  let movedTab: WorkspaceTab | null = null;
  const afterRemove = updateLeaf(tree, fromGroupId, (leaf) => {
    const idx = leaf.tabs.findIndex((t) => tabKeyOf(t) === fromId);
    const moved = leaf.tabs[idx];
    if (idx === -1 || !moved) return leaf;
    movedTab = moved;
    return { ...closeTab(leaf, fromId), kind: "leaf", groupId: leaf.groupId };
  });
  if (!movedTab) return tree;
  const m = movedTab;
  const afterInsert = updateLeaf(afterRemove, toGroupId, (leaf) => {
    const toIdx = toId ? leaf.tabs.findIndex((t) => tabKeyOf(t) === toId) : -1;
    const tabs = toId && toIdx !== -1 ? [...leaf.tabs.slice(0, toIdx), m, ...leaf.tabs.slice(toIdx)] : [...leaf.tabs, m];
    return { ...leaf, tabs, active: fromId };
  });
  return removeEmptyLeaf(afterInsert);
}

/** 落点判定：四向边缘（25% 贴边）/ 中央 join（并入目标组） */
export type SplitZone = SplitSide | "join";

export function resolveDropSide(x: number, y: number): SplitZone {
  const EDGE = 0.25;
  if (x < EDGE) return "left";
  if (x > 1 - EDGE) return "right";
  if (y < EDGE) return "top";
  if (y > 1 - EDGE) return "bottom";
  return "join";
}

const SERIALIZE_VERSION = 1;

/** localStorage 存储键（06：分区布局持久化——独立于 panel width 键） */
export const SPLIT_TREE_STORAGE_KEY = "pi-web.split-tree.v1";

/** 树 → JSON（版本化） */
export function serializeTree(tree: LayoutNode): string {
  return JSON.stringify({ v: SERIALIZE_VERSION, tree });
}

/** JSON → 树；损坏/旧格式 → 初始空树（兜底） */
export function deserializeTree(json: string): LayoutNode {
  try {
    const data: unknown = JSON.parse(json);
    if (isValidData(data)) {
      syncIdSeq(data.tree);
      return data.tree;
    }
  } catch {
    /* 损坏 → 兜底 */
  }
  return initialTree();
}

/** 恢复树后同步 id 计数器（groupId/splitId 数字后缀取最大）——避免后续生成撞 id */
function syncIdSeq(tree: LayoutNode): void {
  const nums: number[] = [];
  const walk = (n: LayoutNode): void => {
    if (n.kind === "leaf") {
      const m = /(\d+)$/.exec(n.groupId);
      if (m) nums.push(Number(m[1]));
      return;
    }
    const m = /(\d+)$/.exec(n.id);
    if (m) nums.push(Number(m[1]));
    walk(n.a);
    walk(n.b);
  };
  walk(tree);
  if (nums.length > 0) idSeq = Math.max(idSeq, ...nums);
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
    if (typeof l.groupId !== "string" || !Array.isArray(l.tabs) || typeof l.active !== "string") return false;
    // review：tab 对象形状校验（损坏项 → 兜底初始树）
    return l.tabs.every((tb) => {
      if (typeof tb !== "object" || tb === null) return false;
      const x = tb as { kind?: unknown; path?: unknown; sessionId?: unknown };
      if (x.kind === "file" || x.kind === "diff") return typeof x.path === "string";
      if (x.kind === "chat") return typeof x.sessionId === "string";
      return false;
    });
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
