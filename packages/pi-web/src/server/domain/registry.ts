/**
 * 多实例注册表（纯逻辑，无 IO）：
 * - 状态文件解析（.pi/web.json：宿主端口/token）
 * - 进程表增删查（宿主/注册者 entry）
 */

export interface WebStateFile {
  port: number;
  token: string;
  /** 服务进程 pid（web 服务独立进程——旧格式 hostPid 兼容解析） */
  serverPid: number;
  startedAt: number;
}

export type AgentKind = "host" | "spawned" | "external";

export interface AgentEntry {
  processId: string;
  pid: number;
  kind: AgentKind;
  /** 注册时该进程的当前 session 文件（历史读取用） */
  sessionFile: string | null;
  sessionName: string | null;
  cwd: string;
  connectedAt: number;
}

/** 宿主进程的固定 processId */
export const HOST_PROCESS_ID = "host";

/** 解析状态文件文本；非法/字段缺失返回 null */
export function parseStateFile(text: string): WebStateFile | null {
  try {
    const obj = JSON.parse(text) as Record<string, unknown>;
    if (typeof obj.port !== "number" || !Number.isInteger(obj.port)) return null;
    if (typeof obj.token !== "string" || obj.token.length < 8) return null;
    const serverPid = typeof obj.serverPid === "number" ? obj.serverPid : obj.hostPid;
    if (typeof serverPid !== "number") return null;
    const startedAt = typeof obj.startedAt === "number" ? obj.startedAt : Date.now();
    return { port: obj.port, token: obj.token, serverPid, startedAt };
  } catch {
    return null;
  }
}

/** 序列化状态文件 */
export function serializeStateFile(state: WebStateFile): string {
  return JSON.stringify(state, null, 2);
}

/** 生成状态文件路径（cwd 内 .pi/web.json） */
export function stateFilePath(cwd: string): string {
  return `${cwd.replace(/\/+$/, "")}/.pi/web.json`;
}

/** 内存进程表（宿主进程内） */
export class RegistryStore {
  private entries = new Map<string, AgentEntry>();

  add(entry: AgentEntry): void {
    this.entries.set(entry.processId, entry);
  }

  remove(processId: string): void {
    this.entries.delete(processId);
  }

  get(processId: string): AgentEntry | null {
    return this.entries.get(processId) ?? null;
  }

  list(): AgentEntry[] {
    return [...this.entries.values()];
  }

  /** 生成新注册者 processId（宿主固定 host；其余 p-<n> 从 1 递增） */
  nextProcessId(kind: AgentKind): string {
    if (kind === "host") return HOST_PROCESS_ID;
    let n = 1;
    while (this.entries.has(`p-${n}`)) n += 1;
    return `p-${n}`;
  }
}
