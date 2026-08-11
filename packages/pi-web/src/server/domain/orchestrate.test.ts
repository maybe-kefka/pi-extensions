import { describe, expect, it } from "vitest";
import { resolveConnectAction } from "./orchestrate.js";
import type { WebStateFile } from "./registry.js";

const stateFile: WebStateFile = { port: 3939, token: "abc12345def", serverPid: 1, startedAt: 1 };

describe("resolveConnectAction（/web 注册编排——无宿主语义）", () => {
  it("无状态文件 → spawn 服务进程", () => {
    expect(resolveConnectAction(null, false)).toBe("spawn");
  });

  it("状态文件存在且端口存活 → 直接注册", () => {
    expect(resolveConnectAction(stateFile, true)).toBe("connect");
  });

  it("状态文件存在但端口不通（残留）→ 清理后 spawn", () => {
    expect(resolveConnectAction(stateFile, false)).toBe("cleanup-spawn");
  });
});
