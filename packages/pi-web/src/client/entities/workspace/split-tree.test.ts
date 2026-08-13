/**
 * 递归分区树（entities/workspace/split-tree）——S1 seam 纯函数测试。
 * 先例：tabs.test.ts（纯函数实体测试）。
 * 01 切片：单组等价（树结构 + 组内操作路由 + 序列化骨架）。
 */
import { describe, expect, it } from "vitest";
import {
  findGroupOfTree,
  findLeaf,
  flattenTabs,
  initialTree,
  setSplitRatio,
  mapLeaf,
  moveTabToGroup,
  removeEmptyLeaf,
  removeTabFromTree,
  resolveDropSide,
  serializeTree,
  deserializeTree,
  singleLeafOf,
  splitGroup,
} from "./split-tree";
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
    // 再对左侧原组（a）分区——先给 a 组加 /d.ts（否则 /a.ts 移走后 a 空 → 合并）
    if (tree.kind !== "split") return;
    const aGid = (tree.a as { kind: "leaf"; groupId: string }).groupId;
    tree = mapLeaf(tree, aGid, (leaf) => openFile(leaf, "/d.ts", "d.ts"));
    tree = splitGroup(tree, aGid, "bottom", "/a.ts");
    const groups = leafTabsOf(tree);
    expect(groups).toHaveLength(3);
    expect(groups.map((g) => g.paths)).toEqual([["/d.ts"], ["/a.ts"], ["/b.ts"]]);
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

  it("resolveDropSide：四向边缘判定 + 中央 join", () => {
    expect(resolveDropSide(0.05, 0.5)).toBe("left");
    expect(resolveDropSide(0.95, 0.5)).toBe("right");
    expect(resolveDropSide(0.5, 0.05)).toBe("top");
    expect(resolveDropSide(0.5, 0.95)).toBe("bottom");
    expect(resolveDropSide(0.5, 0.5)).toBe("join");
    // 角落：左右优先
    expect(resolveDropSide(0.05, 0.05)).toBe("left");
  });
});

/** 两 leaf：g1=[/a.ts]（左），g2=[/b.ts]（右，被 splitGroup 移入）——03/04 共用 */
const twoLeaf = (): LayoutNode => {
  let tree = initialTree();
  const gid = singleLeafOf(tree).groupId;
  tree = mapLeaf(tree, gid, (leaf) => openFile(leaf, "/a.ts", "a.ts"));
  tree = mapLeaf(tree, gid, (leaf) => openFile(leaf, "/b.ts", "b.ts"));
  return splitGroup(tree, gid, "right", "/b.ts");
};
const gids = (tree: LayoutNode): string[] => leafTabsOf(tree).map((g) => g.groupId);

describe("split-tree 03：跨组移动与空组合并", () => {

  it("跨组移动：原组移除、目标组插入（toId 前）、目标激活、原组激活相邻", () => {
    let tree = twoLeaf();
    const [left, right] = gids(tree);
    // 再在左组开 /c.ts（目标：把左组 /a.ts 移到右组 /b.ts 前）
    tree = mapLeaf(tree, left, (leaf) => openFile(leaf, "/c.ts", "c.ts"));
    tree = moveTabToGroup(tree, right, "/a.ts", "/b.ts");
    const groups = leafTabsOf(tree);
    expect(groups.find((g) => g.groupId === right)?.paths).toEqual(["/a.ts", "/b.ts"]);
    expect(groups.find((g) => g.groupId === right)?.active).toBe("/a.ts");
    expect(groups.find((g) => g.groupId === left)?.paths).toEqual(["/c.ts"]);
    expect(groups.find((g) => g.groupId === left)?.active).toBe("/c.ts");
  });

  it("跨组移动到空组/末尾（toId null）：追加", () => {
    let tree = twoLeaf();
    const [left, right] = gids(tree);
    tree = mapLeaf(tree, right, (leaf) => closeTab(leaf, "/b.ts"));
    tree = moveTabToGroup(tree, right, "/a.ts", null);
    const groups = leafTabsOf(tree);
    // 左组唯一 tab 移走 → 左组合并（只剩右组）
    expect(groups).toHaveLength(1);
    expect(groups[0].groupId).toBe(right);
    expect(groups[0].paths).toEqual(["/a.ts"]);
  });

  it("同组移动退化为调序", () => {
    let tree = twoLeaf();
    const [left] = gids(tree);
    tree = mapLeaf(tree, left, (leaf) => openFile(leaf, "/c.ts", "c.ts"));
    tree = moveTabToGroup(tree, left, "/c.ts", "/a.ts");
    const groups = leafTabsOf(tree);
    expect(groups.find((g) => g.groupId === left)?.paths).toEqual(["/c.ts", "/a.ts"]);
  });

  it("移走唯一 tab：原组自动合并（树回单 leaf，被移 tab 保留）", () => {
    let tree = twoLeaf();
    const [left, right] = gids(tree);
    // 左组只有 /a.ts——移走后左组空 → 合并 → 只剩右组
    tree = moveTabToGroup(tree, right, "/a.ts", null);
    expect(tree.kind).toBe("leaf");
    if (tree.kind === "leaf") expect(tree.tabs.map((t) => (t.kind === "file" ? t.path : null))).toEqual(["/b.ts", "/a.ts"]);
  });

  it("removeEmptyLeaf：嵌套 split 的空组递归提升", () => {
    // 三层：g1=[/a] | (g2=[/b] | g3=[/c])——清空 g1 所在分支后提升
    let tree = initialTree();
    const gid = singleLeafOf(tree).groupId;
    for (const p of ["/a.ts", "/b.ts", "/c.ts"]) tree = mapLeaf(tree, gid, (leaf) => openFile(leaf, p, p));
    tree = splitGroup(tree, gid, "right", "/b.ts"); // g1=[/a,/c] | g2=[/b]
    if (tree.kind !== "split") return;
    const g1 = singleLeafOf(tree).groupId;
    tree = splitGroup(tree, g1, "bottom", "/c.ts"); // (g1=[/a] | g3=[/c]) | g2=[/b]
    const groups = leafTabsOf(tree);
    const g3 = groups.find((g) => g.paths[0] === "/c.ts")!.groupId;
    // 清空 g3（/c.ts 关闭）→ g3 空 → 提升 g1 到该层
    tree = mapLeaf(tree, g3, (leaf) => closeTab(leaf, "/c.ts"));
    tree = removeEmptyLeaf(tree);
    const after = leafTabsOf(tree);
    expect(after).toHaveLength(2);
    expect(after.map((g) => g.paths)).toEqual([["/a.ts"], ["/b.ts"]]);
  });

  it("splitGroup 单 tab 守卫：源组=目标组 且仅 1 tab → 原树不变（无意义拆分）", () => {
    let tree = initialTree();
    const gid = singleLeafOf(tree).groupId;
    tree = mapLeaf(tree, gid, (leaf) => openFile(leaf, "/a.ts", "a.ts"));
    expect(splitGroup(tree, gid, "right", "/a.ts")).toBe(tree);
    expect(splitGroup(tree, gid, "left", "/a.ts")).toBe(tree);
    expect(splitGroup(tree, gid, "top", "/a.ts")).toBe(tree);
  });
});

describe("split-tree 05：跨组拆分", () => {
  const twoLeaf = (): LayoutNode => {
    let tree = initialTree();
    const gid = singleLeafOf(tree).groupId;
    tree = mapLeaf(tree, gid, (leaf) => openFile(leaf, "/a.ts", "a.ts"));
    tree = mapLeaf(tree, gid, (leaf) => openFile(leaf, "/b.ts", "b.ts"));
    return splitGroup(tree, gid, "right", "/b.ts");
  };
  const gids = (tree: LayoutNode): string[] => leafTabsOf(tree).map((g) => g.groupId);

  it("跨组右缘拆分：从源组移除、目标组一分为二、tab 入新组（右）", () => {
    let tree = twoLeaf();
    const [left, right] = gids(tree);
    tree = mapLeaf(tree, left, (leaf) => openFile(leaf, "/c.ts", "c.ts"));
    tree = splitGroup(tree, right, "right", "/a.ts");
    expect(tree.kind).toBe("split");
    if (tree.kind !== "split") return;
    expect(tree.dir).toBe("row");
    expect(tree.ratio).toBe(0.5);
    const groups = leafTabsOf(tree);
    expect(groups).toHaveLength(3);
    expect(groups.map((g) => g.paths)).toEqual([["/c.ts"], ["/b.ts"], ["/a.ts"]]);
    expect(groups[2].active).toBe("/a.ts");
  });

  it("跨组左缘拆分：新组在左", () => {
    let tree = twoLeaf();
    const [left, right] = gids(tree);
    tree = mapLeaf(tree, left, (leaf) => openFile(leaf, "/c.ts", "c.ts"));
    tree = splitGroup(tree, right, "left", "/a.ts");
    const groups = leafTabsOf(tree);
    expect(groups.map((g) => g.paths)).toEqual([["/c.ts"], ["/a.ts"], ["/b.ts"]]);
  });

  it("跨组拆分源组空 → 自动回收", () => {
    let tree = twoLeaf(); // 左=[/a.ts] 右=[/b.ts]，均为单 tab
    const [left, right] = gids(tree);
    tree = splitGroup(tree, right, "right", "/a.ts");
    const groups = leafTabsOf(tree);
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.paths)).toEqual([["/b.ts"], ["/a.ts"]]);
  });

  it("单 tab 源组跨组拆分仍有效（目标=其他组）", () => {
    let tree = twoLeaf(); // 左=[/a.ts] 右=[/b.ts]
    const [left] = gids(tree);
    tree = splitGroup(tree, left, "right", "/b.ts"); // 源右（单 tab），目标左
    const groups = leafTabsOf(tree);
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.paths)).toEqual([["/a.ts"], ["/b.ts"]]);
  });

  it("跨组拆分不存在的 tabId → 原树不变", () => {
    let tree = twoLeaf();
    const [, right] = gids(tree);
    expect(splitGroup(tree, right, "right", "/nope.ts")).toBe(tree);
  });

  it("跨组拆分不存在的目标 groupId → 原树不变", () => {
    let tree = twoLeaf();
    expect(splitGroup(tree, "nope", "right", "/a.ts")).toBe(tree);
  });
});

describe("split-tree 04：按组定位与任意组移除", () => {
  it("findGroupOfTree：定位 tab 所在组（嵌套树）", () => {
    let tree = twoLeaf();
    const right = gids(tree)[1];
    tree = mapLeaf(tree, right, (leaf) => openFile(leaf, "/c.ts", "c.ts"));
    expect(findGroupOfTree(tree, "/a.ts")).toBe(gids(tree)[0]);
    expect(findGroupOfTree(tree, "/b.ts")).toBe(right);
    expect(findGroupOfTree(tree, "/nope.ts")).toBeNull();
  });

  it("removeTabFromTree：从所在组移除（不指定组）", () => {
    let tree = twoLeaf();
    const right = gids(tree)[1];
    tree = mapLeaf(tree, right, (leaf) => openFile(leaf, "/c.ts", "c.ts"));
    const [left] = gids(tree);
    tree = removeTabFromTree(tree, "/a.ts");
    // 左组唯一 tab 移除 → 组消失（合并），右组保留
    expect(leafTabsOf(tree).find((g) => g.groupId === left)).toBeUndefined();
    expect(leafTabsOf(tree).map((g) => g.paths)).toEqual([["/b.ts", "/c.ts"]]);
  });

  it("findLeaf / flattenTabs：定位 leaf 与展平 tabs", () => {
    const tree = twoLeaf();
    const right = gids(tree)[1];
    expect(findLeaf(tree, right)?.groupId).toBe(right);
    expect(findLeaf(tree, "nope")).toBeNull();
    expect(flattenTabs(tree).map((t) => (t.kind === "file" ? t.path : null))).toEqual(["/a.ts", "/b.ts"]);
  });

  it("removeTabFromTree：移除后组空 → 自动合并", () => {
    let tree = twoLeaf();
    tree = removeTabFromTree(tree, "/a.ts");
    // 左组唯一 tab 移除 → 合并（单 leaf 只剩 /b.ts）
    expect(tree.kind).toBe("leaf");
    if (tree.kind === "leaf") expect(tree.tabs.map((t) => (t.kind === "file" ? t.path : null))).toEqual(["/b.ts"]);
  });
});

describe("split-tree 05：split 比例调整", () => {
  it("setSplitRatio：正常设置", () => {
    const tree = twoLeaf();
    if (tree.kind !== "split") return;
    const id = tree.id;
    const next = setSplitRatio(tree, id, 0.3);
    if (next.kind !== "split") return;
    expect(next.ratio).toBe(0.3);
  });

  it("setSplitRatio：clamp 下限/上限", () => {
    const tree = twoLeaf();
    if (tree.kind !== "split") return;
    const id = tree.id;
    expect((setSplitRatio(tree, id, 0.05) as { ratio: number }).ratio).toBe(0.2);
    expect((setSplitRatio(tree, id, 0.97) as { ratio: number }).ratio).toBe(0.8);
  });

  it("setSplitRatio：自定义 minRatio（像素换算）", () => {
    const tree = twoLeaf();
    if (tree.kind !== "split") return;
    const id = tree.id;
    expect((setSplitRatio(tree, id, 0.1, 0.3) as { ratio: number }).ratio).toBe(0.3);
  });

  it("setSplitRatio：不存在的 splitId → 原树不变；嵌套只改目标层", () => {
    const tree = twoLeaf();
    expect(setSplitRatio(tree, "nope", 0.3)).toBe(tree);
    // 嵌套：外层 split + 内层再分——只改内层
    if (tree.kind !== "split") return;
    const aGid = (tree.a as { kind: "leaf"; groupId: string }).groupId;
    let nested: LayoutNode = tree;
    nested = mapLeaf(nested, aGid, (leaf) => openFile(leaf, "/c.ts", "c.ts"));
    nested = splitGroup(nested, aGid, "bottom", "/c.ts");
    if (nested.kind !== "split") return;
    const inner = (nested.a as { kind: "split"; id: string }).id;
    const next = setSplitRatio(nested, inner, 0.4);
    if (next.kind !== "split") return;
    expect((next.a as { ratio: number }).ratio).toBe(0.4);
    expect(next.ratio).toBe(0.5); // 外层不变
  });
});

describe("split-tree 06：持久化", () => {
  it("多级嵌套 round-trip：结构 + 各组 tabs + ratio 完整还原", () => {
    let tree = initialTree();
    const gid = singleLeafOf(tree).groupId;
    tree = mapLeaf(tree, gid, (leaf) => openFile(leaf, "/a.ts", "a.ts"));
    tree = mapLeaf(tree, gid, (leaf) => openFile(leaf, "/b.ts", "b.ts"));
    tree = mapLeaf(tree, gid, (leaf) => openChatTab(leaf, "/s.jsonl", "会话"));
    tree = splitGroup(tree, gid, "right", "/b.ts");
    if (tree.kind !== "split") return;
    // 调比例 + 左组再分
    const outerId = tree.id;
    tree = setSplitRatio(tree, outerId, 0.35);
    if (tree.kind !== "split") return;
    const aGid = (tree.a as { kind: "leaf"; groupId: string }).groupId;
    tree = splitGroup(tree, aGid, "bottom", "/a.ts");
    const restored = deserializeTree(serializeTree(tree));
    expect(restored).toEqual(tree);
  });

  it("序列化保留 chat dead 标记", () => {
    let tree = initialTree();
    const gid = singleLeafOf(tree).groupId;
    tree = mapLeaf(tree, gid, (leaf) => openChatTab(leaf, "/s.jsonl", "会话"));
    tree = mapLeaf(tree, gid, (leaf) => markChatDead(leaf, "/s.jsonl"));
    const restored = deserializeTree(serializeTree(tree));
    const leaf = singleLeafOf(restored);
    expect(leaf.tabs).toEqual([{ kind: "chat", sessionId: "/s.jsonl", name: "会话", dead: true }]);
  });

  it("恢复后新生成的 id 不与恢复树冲突（idSeq 同步）", () => {
    let tree = initialTree();
    const gid = singleLeafOf(tree).groupId;
    tree = mapLeaf(tree, gid, (leaf) => openFile(leaf, "/a.ts", "a.ts"));
    tree = mapLeaf(tree, gid, (leaf) => openFile(leaf, "/b.ts", "b.ts"));
    tree = splitGroup(tree, gid, "right", "/b.ts");
    const restored = deserializeTree(serializeTree(tree));
    if (restored.kind !== "split") return;
    const ids = new Set<string>();
    const walk = (n: LayoutNode): void => {
      if (n.kind === "leaf") {
        ids.add(n.groupId);
        return;
      }
      ids.add(n.id);
      walk(n.a);
      walk(n.b);
    };
    walk(restored);
    // 再 splitGroup（应生成新 id——不撞恢复树）；左组加 /c.ts 避免单 tab 守卫（守卫场景不生成新 id）
    const rg = singleLeafOf(restored).groupId;
    const withC = mapLeaf(restored, rg, (leaf) => openFile(leaf, "/c.ts", "c.ts"));
    const next = splitGroup(withC, rg, "right", "/a.ts");
    const nextIds = new Set<string>();
    const walk2 = (n: LayoutNode): void => {
      if (n.kind === "leaf") {
        nextIds.add(n.groupId);
        return;
      }
      nextIds.add(n.id);
      walk2(n.a);
      walk2(n.b);
    };
    walk2(next);
    // 生成的新 id 不与恢复树冲突、树内无重复
    const newIds = [...nextIds].filter((id) => !ids.has(id));
    expect(newIds.length).toBeGreaterThan(0);
    expect(nextIds.size).toBe([...nextIds].length);
    for (const id of newIds) expect(ids.has(id)).toBe(false);
  });
});

describe("split-tree 07：bug 修复回归", () => {
  it("splitGroup：原组 active 是被拖 tab 时激活相邻（chat 不丢聚焦）", () => {
    let tree = initialTree();
    const gid = singleLeafOf(tree).groupId;
    tree = mapLeaf(tree, gid, (leaf) => openChatTab(leaf, "/s.jsonl", "会话"));
    tree = mapLeaf(tree, gid, (leaf) => openFile(leaf, "/a.ts", "a.ts")); // active = file
    tree = splitGroup(tree, gid, "right", "/a.ts");
    const groups = leafTabsOf(tree);
    const left = groups.find((g) => g.groupId === gid);
    expect(left?.paths).toEqual([null]); // chat 保留
    expect(left?.active).toBe("chat:/s.jsonl"); // 激活相邻（chat）
    expect(groups[1].active).toBe("/a.ts"); // 新组激活被拖 tab
  });

  it("splitGroup：原组 active 不是被拖 tab 时保持", () => {
    let tree = initialTree();
    const gid = singleLeafOf(tree).groupId;
    tree = mapLeaf(tree, gid, (leaf) => openChatTab(leaf, "/s.jsonl", "会话"));
    tree = mapLeaf(tree, gid, (leaf) => openFile(leaf, "/a.ts", "a.ts"));
    tree = mapLeaf(tree, gid, (leaf) => openChatTab(leaf, "/s.jsonl", "会话")); // 激活回 chat
    tree = splitGroup(tree, gid, "right", "/a.ts");
    const groups = leafTabsOf(tree);
    expect(groups.find((g) => g.groupId === gid)?.active).toBe("chat:/s.jsonl");
  });
});
