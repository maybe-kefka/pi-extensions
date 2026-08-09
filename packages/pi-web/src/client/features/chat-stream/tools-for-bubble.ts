/** R23 F2：per-bubble 工具行过滤 + 引用稳定缓存（纯函数，可单测）。 */

import { bubbleToolCallIds, type ToolRow, type TurnBubble } from "@/entities/chat/stream";

/**
 * 返回气泡相关的工具行（按 bubbleToolCallIds 过滤）。
 * 引用稳定：若过滤结果与缓存元素引用全同（相关行内容未变）→ 返回缓存数组，
 * 使 React Compiler 的 props 引用比较生效（历史气泡在工具流式中不重渲染）。
 * cache 由调用方（Chat）以 ref 持有；陈旧条目（气泡删除）无碍——按 id 重新查询即重建。
 */
export function toolsForBubble(
  bubble: TurnBubble,
  rows: ToolRow[],
  cache: Map<string, ToolRow[]>,
): ToolRow[] {
  const ids = new Set(bubbleToolCallIds(bubble));
  const filtered = ids.size === 0 ? [] : rows.filter((r) => ids.has(r.toolCallId));
  const cached = cache.get(bubble.id);
  if (
    cached &&
    cached.length === filtered.length &&
    cached.every((r, i) => r === filtered[i])
  ) {
    return cached;
  }
  cache.set(bubble.id, filtered);
  return filtered;
}
