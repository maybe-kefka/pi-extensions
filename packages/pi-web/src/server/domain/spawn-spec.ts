/**
 * spawn 参数构造（纯函数）：web 服务进程 / 会话实例的统一 spawn 规格。
 * 历史教训：argv 用数组传参（不拼字符串——空格/引号安全）；服务模式标志走 env
 * （pi CLI 未知参数报错退出）。
 */

export interface SpawnSpec {
  /** spawn 的入口可执行（node） */
  execPath: string;
  /** argv（pi 入口 + 参数） */
  argv: string[];
  /** 新增环境变量（与 process.env 合并） */
  env: Record<string, string>;
}

/** web 服务进程规格：pi --mode rpc --extension <入口> + PI_WEB_SERVICE=1 */
export function webServiceSpawnSpec(opts: {
  execPath: string;
  piEntry: string;
  extensionPath: string;
}): SpawnSpec {
  return {
    execPath: opts.execPath,
    argv: [opts.piEntry, "--mode", "rpc", "--extension", opts.extensionPath],
    env: { PI_WEB_SERVICE: "1" },
  };
}

/** 会话实例规格：pi --mode rpc --extension <入口> --session <file> + 自动注册 env（kind=spawned） */
export function sessionInstanceSpawnSpec(opts: {
  execPath: string;
  piEntry: string;
  extensionPath: string;
  sessionFile: string;
  hostUrl: string;
}): SpawnSpec {
  return {
    execPath: opts.execPath,
    argv: [opts.piEntry, "--mode", "rpc", "--extension", opts.extensionPath, "--session", opts.sessionFile],
    env: { PI_WEB_HOST_URL: opts.hostUrl, PI_WEB_HOST_KIND: "spawned" },
  };
}

/** 新建会话实例规格：pi --mode rpc --extension <入口> --session-id <新 id>（创建新会话） */
export function newSessionSpawnSpec(opts: {
  execPath: string;
  piEntry: string;
  extensionPath: string;
  sessionId: string;
  hostUrl: string;
}): SpawnSpec {
  return {
    execPath: opts.execPath,
    argv: [opts.piEntry, "--mode", "rpc", "--extension", opts.extensionPath, "--session-id", opts.sessionId],
    env: { PI_WEB_HOST_URL: opts.hostUrl, PI_WEB_HOST_KIND: "spawned" },
  };
}
