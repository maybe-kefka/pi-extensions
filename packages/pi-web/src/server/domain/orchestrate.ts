/**
 * 注册编排（纯函数）：/web 与事件驱动的决策逻辑。
 * web-console 只做 IO 接线（spawn/WS/状态文件读写），所有分支决策收在这里。
 */

import type { WebStateFile } from "./registry.js";

/** /web 注册动作：无服务 → spawn；存活 → 注册；残留 → 清理后 spawn */
export type ConnectAction = "connect" | "spawn" | "cleanup-spawn";

export function resolveConnectAction(stateFile: WebStateFile | null, portAlive: boolean): ConnectAction {
  if (!stateFile) return "spawn";
  return portAlive ? "connect" : "cleanup-spawn";
}
