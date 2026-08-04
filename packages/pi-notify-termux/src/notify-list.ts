/** termux-notification-list 输出解析（纯函数，TDD：test/notify-list.test.ts）。
 *  用于 /notify status：显示通知栏里 pi 通知的实时状态（发送确认/残留排查）。
 *  需要 Termux:API 通知权限全开（Android 13+），否则 list 返回空。 */

export interface ShadeNotification {
  tag: string;
  packageName: string;
  title: string;
  content: string;
}

export interface PiShadeState {
  /** 结果通知（固定 id）是否在通知栏 */
  result: boolean;
  /** 通知栏里的提问通知 id 列表 */
  asks: string[];
}

/** 解析 termux-notification-list 的 JSON 输出；非法输入 → [] */
export function parseNotificationList(json: string): ShadeNotification[] {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const out: ShadeNotification[] = [];
  for (const item of data) {
    if (typeof item !== "object" || item === null) continue;
    const rec = item as Record<string, unknown>;
    if (typeof rec.tag !== "string") continue;
    out.push({
      tag: rec.tag,
      packageName: typeof rec.packageName === "string" ? rec.packageName : "",
      title: typeof rec.title === "string" ? rec.title : "",
      content: typeof rec.content === "string" ? rec.content : "",
    });
  }
  return out;
}

/** 从通知栏列表里找出 pi 的通知（结果通知固定 id + ask-<id> 提问） */
export function findPiNotifications(
  list: ShadeNotification[],
  resultId: string,
): PiShadeState {
  const asks: string[] = [];
  let result = false;
  for (const n of list) {
    if (n.packageName !== "com.termux.api") continue;
    if (n.tag === resultId) {
      result = true;
    } else if (n.tag.startsWith("ask-")) {
      asks.push(n.tag.slice("ask-".length));
    }
  }
  return { result, asks };
}

/** 状态文案行 */
export function renderNotificationStatus(
  state: PiShadeState,
  resultId: string,
): string[] {
  if (!state.result && state.asks.length === 0) {
    return ["通知栏：无 pi 通知（发送失败可查 list 权限）"];
  }
  const lines: string[] = [];
  if (state.result) lines.push(`通知栏：结果通知在栏（${resultId}）`);
  for (const id of state.asks) lines.push(`通知栏：提问在栏（ask-${id}）`);
  return lines;
}
