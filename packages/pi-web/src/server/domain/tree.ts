/** 最小树形状（内核 SessionTreeNode / 前端 TreeNode 均兼容，domain 层不依赖任一侧类型） */
type TreeLike<T> = { entry: { id: string }; children: T[] };

/**
 * 限制树深度：JSON.stringify 递归深度有上限（约 1 万层），会话树若出现异常深链
 * （如 parentId 链延伸/环）会导致响应序列化 RangeError 杀死进程。
 * 截断点 children 置空并标记 truncated，前端显示"已截断"提示。
 */
export function truncateTree<T extends TreeLike<T>>(nodes: T[], maxDepth: number): (T & { truncated?: boolean })[] {
  const walk = (node: T, depth: number, seen: ReadonlySet<string>): T & { truncated?: boolean } => {
    if (depth >= maxDepth || seen.has(node.entry.id)) {
      return { ...node, children: [], truncated: true };
    }
    const next = new Set(seen);
    next.add(node.entry.id);
    return { ...node, children: node.children.map((c) => walk(c, depth + 1, next)) };
  };
  return nodes.map((n) => walk(n, 0, new Set()));
}
