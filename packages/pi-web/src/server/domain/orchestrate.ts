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

/** 会话实例幂等决策：注册表已有该会话 → 复用；否则 spawn 新实例 */
export interface SessionAgentLike {
  processId: string;
  sessionFile: string | null;
}

export function resolveSessionInstance(agents: SessionAgentLike[], sessionFile: string): "existing" | "spawn" {
  return agents.some((a) => a.sessionFile === sessionFile) ? "existing" : "spawn";
}

/** TUI 切会话编排：目标会话已有 spawn 实例 → 杀（jsonl 双写排他）；TUI 自己/无撞车不杀 */
export function resolveTuiSessionSwitch(
  agents: SessionAgentLike[],
  tuiProcessId: string,
  newSessionFile: string,
): { kill: string[] } {
  const kill = agents
    .filter((a) => a.processId !== tuiProcessId && a.sessionFile === newSessionFile)
    .map((a) => a.processId);
  return { kill };
}
