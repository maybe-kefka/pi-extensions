import { describe, expect, it } from "vitest";
import { truncateTree } from "./tree.js";
import type { TreeNode } from "../../client/entities/chat/chat-model.js";

function node(id: string, children: TreeNode[] = []): TreeNode {
  return {
    entry: { type: "message", id, parentId: null, timestamp: "2026-01-01T00:00:00Z" },
    children,
  };
}

describe("truncateTree：pi:getTree 响应深度防线（R27 会话树爆栈）", () => {
  it("浅树原样返回", () => {
    const tree = [node("a", [node("b"), node("c", [node("d")])])];
    expect(truncateTree(tree, 10)).toEqual(tree);
  });

  it("深度超过 maxDepth 的节点截断为 children: [] 并标记 truncated", () => {
    // 链 a → b → c → d（深度 4）
    const tree = [node("a", [node("b", [node("c", [node("d")])])])];
    const out = truncateTree(tree, 3);
    // a(1) → b(2) → c(3) → d 超限：d 被截断，c 保留
    expect(out[0].children[0].children[0].children[0]).toMatchObject({ truncated: true, children: [] });
    expect(out[0].children[0].children[0].children[0].children).toEqual([]);
    // 未截断节点无标记
    expect(out[0].children[0].children[0]).not.toHaveProperty("truncated");
  });

  it("环（同一 id 在同路径重现）截断防死循环", () => {
    const cyclic = node("x");
    cyclic.children = [node("y", [cyclic])];
    const out = truncateTree([cyclic], 10);
    // y 的子节点 x 已在路径上 → x 被截断（y 的 children 保留截断标记节点）
    expect(out[0].children[0].children[0]).toMatchObject({ truncated: true, children: [] });
  });

  it("空树返回空", () => {
    expect(truncateTree([], 10)).toEqual([]);
  });
});
