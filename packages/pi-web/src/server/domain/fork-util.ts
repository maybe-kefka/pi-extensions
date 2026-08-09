/**
 * userIndex → entryId 解析 + 捕获 ctx 失效判定（纯函数）。
 * SPEC §4.4 `pi:fork`：气泡 fork 发 `{userIndex}`，后端按 getEntries() 顺序数第 N 条 user 消息。
 */

export interface ForkEntryLike {
  type?: string;
  message?: { role?: string } | null;
  id?: string;
}

/**
 * 按顺序数 user 消息 entry（0-based），返回第 userIndex 条的 id；越界/无匹配 → null。
 * 只计 `type === "message" && message.role === "user"` 的条目。
 */
export function resolveUserEntryId(entries: ForkEntryLike[] | null | undefined, userIndex: number): string | null {
  if (!Array.isArray(entries) || !Number.isInteger(userIndex) || userIndex < 0) return null;
  let seen = -1;
  for (const e of entries) {
    if (!e || e.type !== "message" || e.message?.role !== "user") continue;
    seen += 1;
    if (seen === userIndex) return e.id ?? null;
  }
  return null;
}

/** 捕获的 pi / command ctx 失效判定（上游 stale 错误消息）。 */
export function isStaleError(err: unknown): boolean {
  return err instanceof Error && err.message.includes("stale");
}
