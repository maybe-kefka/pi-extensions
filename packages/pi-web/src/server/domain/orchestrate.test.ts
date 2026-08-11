import { describe, expect, it } from "vitest";
import { resolveConnectAction, resolveSessionInstance } from "./orchestrate.js";
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

describe("resolveSessionInstance（会话实例幂等）", () => {
  const agents = [{ processId: "p-1", sessionFile: "/s/1.jsonl" }];
  it("已有同会话实例 → existing（不重复 spawn）", () => {
    expect(resolveSessionInstance(agents, "/s/1.jsonl")).toBe("existing");
  });
  it("无实例 → spawn", () => {
    expect(resolveSessionInstance(agents, "/s/2.jsonl")).toBe("spawn");
  });
  it("空 sessionFile 的注册者不影响", () => {
    expect(resolveSessionInstance([{ processId: "p-1", sessionFile: null }], "/s/2.jsonl")).toBe("spawn");
  });
});
