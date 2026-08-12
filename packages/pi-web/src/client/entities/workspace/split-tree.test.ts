/**
 * 递归分区树（entities/workspace/split-tree）——S1 seam 纯函数测试。
 * 先例：tabs.test.ts（纯函数实体测试）。
 * 01 切片：单组等价（树结构 + 组内操作路由 + 序列化骨架）。
 */
import { describe, expect, it } from "vitest";
import { initialTree, mapLeaf, singleLeafOf, serializeTree, deserializeTree, splitGroup, resolveDropSide } from "./split-tree";
import { openFile, closeTab, moveTab, openChatTab, renameChatTab, markChatDead } from "./tabs";
import type { LayoutNode } from "./split-tree";

function leafTabsOf(tree: LayoutNode): { groupId: string; paths: (string | null)[]; active: string }[] {
  const out: { groupId: string; paths: (string | null)[]; active: string }[] = [];
  const walk = (n: LayoutNode): void => {
    if (n.kind === "leaf") {
      out.push({ groupId: n.groupId, paths: n.tabs.map((t) => (t.kind === "file" ? t.path : null)), active: n.active });
      return;
    }
    walk(n.a);
    walk(n.b);
  };
  walk(tree);
  return out;
}

describe("split-tree 01：单组等价", () => {
  it("初始树：单个空 leaf（无 tab、无激活）", () => {
    const tree = initialTree();
    expect(tree.kind).toBe("leaf");
    if (tree.kind === "leaf") {
      expect(tree.groupId).toBeTruthy();
      expect(tree.tabs).toEqual([]);
      expect(tree.active).toBe("");
    }
  });

  it("singleLeafOf：单组树直接给出叶子内容（tabs/active）", () => {
    const tree = initialTree();
    const leaf = singleLeafOf(tree);
    expect(leaf.tabs).toEqual([]);
    expect(leaf.active).toBe("");
  });

  it("组内打开文件：tab 追加且激活（groupId 保留、树结构不变）", () => {
    let tree = initialTree();
    const gid = singleLeafOf(tree).groupId;
    tree = mapLeaf(tree, gid, (leaf) => openFile(leaf, "/a.ts", "a.ts"));
    const leaf = singleLeafOf(tree);
    expect(leaf.groupId).toBe(gid);
    expect(leaf.tabs).toEqual([{ kind: "file", path: "/a.ts", name: "a.ts", dirty: false, preview: false }]);
    expect(leaf.active).toBe("/a.ts");
  });

  it("组内关闭激活 tab：激活右邻（无右邻则左邻）", () => {
    let tree = initialTree();
    const gid = singleLeafOf(tree).groupId;
    tree = mapLeaf(tree, gid, (leaf) => openFile(leaf, "/a.ts", "a.ts"));
    tree = mapLeaf(tree, gid, (leaf) => openFile(leaf, "/b.ts", "b.ts"));
    tree = mapLeaf(tree, gid, (leaf) => openFile(leaf, "/c.ts", "c.ts"));
    // 当前激活 /c.ts（最后打开）——关闭后激活左邻 /b.ts
    tree = mapLeaf(tree, gid, (leaf) => closeTab(leaf, "/c.ts"));
    const leaf = singleLeafOf(tree);
    expect(leaf.tabs.map((t) => (t.kind === "file" ? t.path : null))).toEqual(["/a.ts", "/b.ts"]);
    expect(leaf.active).toBe("/b.ts");
  });

  it("组内调序：moveTab 移动后顺序变化、激活不变", () => {
    let tree = initialTree();
    const gid = singleLeafOf(tree).groupId;
    tree = mapLeaf(tree, gid, (leaf) => openFile(leaf, "/a.ts", "a.ts"));
    tree = mapLeaf(tree, gid, (leaf) => openFile(leaf, "/b.ts", "b.ts"));
    tree = mapLeaf(tree, gid, (leaf) => moveTab(leaf, "/b.ts", "/a.ts"));
    const leaf = singleLeafOf(tree);
    expect(leaf.tabs.map((t) => (t.kind === "file" ? t.path : null))).toEqual(["/b.ts", "/a.ts"]);
  });

  it("组内 chat：打开、改名、dead 标记均路由到叶子", () => {
    let tree = initialTree();
    const gid = singleLeafOf(tree).groupId;
    tree = mapLeaf(tree, gid, (leaf) => openChatTab(leaf, "/s.jsonl", "会话A"));
    tree = mapLeaf(tree, gid, (leaf) => renameChatTab(leaf, "/s.jsonl", "会话A2"));
    tree = mapLeaf(tree, gid, (leaf) => markChatDead(leaf, "/s.jsonl"));
    const leaf = singleLeafOf(tree);
    expect(leaf.tabs).toEqual([{ kind: "chat", sessionId: "/s.jsonl", name: "会话A2", dead: true }]);
  });

  it("serialize/deserialize round-trip：多 tab 单 leaf 完整还原", () => {
    let tree = initialTree();
    const gid = singleLeafOf(tree).groupId;
    tree = mapLeaf(tree, gid, (leaf) => openFile(leaf, "/a.ts", "a.ts"));
    tree = mapLeaf(tree, gid, (leaf) => openChatTab(leaf, "/s.jsonl", "会话"));
    const restored = deserializeTree(serializeTree(tree));
    expect(restored).toEqual(tree);
  });

  it("deserialize 损坏/旧格式 → 初始空树兜底", () => {
    expect(deserializeTree("not json")).toEqual(initialTree());
    expect(deserializeTree(JSON.stringify({ v: 1, tree: { kind: "bogus" } }))).toEqual(initialTree());
    expect(deserializeTree(JSON.stringify({ v: 0, tree: null }))).toEqual(initialTree());
  });
});
describe("split-tree 02：拖拽分区", () => {
  const twoFileTree = (): LayoutNode => {
    let tree = initialTree();
    const gid = singleLeafOf(tree).groupId;
    tree = mapLeaf(tree, gid, (leaf) => openFile(leaf, "/a.ts", "a.ts"));
    tree = mapLeaf(tree, gid, (leaf) => openFile(leaf, "/b.ts", "b.ts"));
    return tree;
  };

  it("splitGroup 右侧：原组移除被拖 tab，新组初始只有它，row 50/50", () => {
    const tree = splitGroup(twoFileTree(), singleLeafOf(twoFileTree()).groupId, "right", "/b.ts");
    expect(tree.kind).toBe("split");
    if (tree.kind !== "split") return;
    expect(tree.dir).toBe("row");
    expect(tree.ratio).toBe(0.5);
    const groups = leafTabsOf(tree);
    expect(groups).toHaveLength(2);
    // a = 原组（只剩 /a.ts），b = 新组（只有 /b.ts 且激活）
    expect(groups[0].paths).toEqual(["/a.ts"]);
    expect(groups[1].paths).toEqual(["/b.ts"]);
    expect(groups[1].active).toBe("/b.ts");
  });

  it("splitGroup 左侧：新组在 a（左）", () => {
    const tree = splitGroup(twoFileTree(), singleLeafOf(twoFileTree()).groupId, "left", "/b.ts");
    if (tree.kind !== "split") return;
    const groups = leafTabsOf(tree);
    expect(groups[0].paths).toEqual(["/b.ts"]);
    expect(groups[1].paths).toEqual(["/a.ts"]);
  });

  it("splitGroup 上下：col 方向", () => {
    const tree = splitGroup(twoFileTree(), singleLeafOf(twoFileTree()).groupId, "top", "/b.ts");
    if (tree.kind !== "split") return;
    expect(tree.dir).toBe("col");
    const groups = leafTabsOf(tree);
    expect(groups[0].paths).toEqual(["/b.ts"]);
    expect(groups[1].paths).toEqual(["/a.ts"]);
  });

  it("splitGroup 在嵌套 split 的子 leaf 上定位（递归）", () => {
    let tree = splitGroup(twoFileTree(), singleLeafOf(twoFileTree()).groupId, "right", "/b.ts");
    // 再对左侧原组（a）分区
    if (tree.kind !== "split") return;
    const aGid = (tree.a as { kind: "leaf"; groupId: string }).groupId;
    tree = splitGroup(tree, aGid, "bottom", "/a.ts");
    const groups = leafTabsOf(tree);
    expect(groups).toHaveLength(3);
    expect(groups.map((g) => g.paths)).toEqual([[], ["/a.ts"], ["/b.ts"]]);
  });

  it("splitGroup 不存在的 tabId → 原树不变", () => {
    const tree = twoFileTree();
    const result = splitGroup(tree, singleLeafOf(tree).groupId, "right", "/nope.ts");
    expect(result).toBe(tree);
  });

  it("splitGroup 不存在的 groupId → 原树不变", () => {
    const tree = twoFileTree();
    expect(splitGroup(tree, "nope", "right", "/a.ts")).toBe(tree);
  });

  it("被拖 tab 是原组唯一 tab：原组变空 leaf 保留（空组合并属于 03）", () => {
    let tree = initialTree();
    const gid = singleLeafOf(tree).groupId;
    tree = mapLeaf(tree, gid, (leaf) => openFile(leaf, "/a.ts", "a.ts"));
    const result = splitGroup(tree, gid, "right", "/a.ts");
    if (result.kind !== "split") return;
    const groups = leafTabsOf(result);
    expect(groups[0].paths).toEqual([]);
    expect(groups[1].paths).toEqual(["/a.ts"]);
  });

  it("resolveDropSide：四向边缘判定 + 中央 null", () => {
    expect(resolveDropSide(0.05, 0.5)).toBe("left");
    expect(resolveDropSide(0.95, 0.5)).toBe("right");
    expect(resolveDropSide(0.5, 0.05)).toBe("top");
    expect(resolveDropSide(0.5, 0.95)).toBe("bottom");
    expect(resolveDropSide(0.5, 0.5)).toBeNull();
    // 角落：左右优先
    expect(resolveDropSide(0.05, 0.05)).toBe("left");
  });
});
