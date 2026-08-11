import { describe, expect, it } from "vitest";
import {
  HOST_PROCESS_ID,
  RegistryStore,
  parseStateFile,
  serializeStateFile,
  stateFilePath,
  type WebStateFile,
} from "./registry";

describe("parseStateFile / serializeStateFile", () => {
  it("解析合法状态文件", () => {
    const state = parseStateFile(
      JSON.stringify({ port: 3939, token: "abc12345def", serverPid: 123, startedAt: 1000 }),
    );
    expect(state).toEqual({ port: 3939, token: "abc12345def", serverPid: 123, startedAt: 1000 });
  });

  it("非法输入返回 null（坏 JSON / 缺字段 / token 过短）", () => {
    expect(parseStateFile("not json")).toBeNull();
    expect(parseStateFile(JSON.stringify({ port: 1 }))).toBeNull();
    expect(parseStateFile(JSON.stringify({ port: 3939, token: "short", serverPid: 1 }))).toBeNull();
    expect(parseStateFile(JSON.stringify({ token: "abcdefgh", serverPid: 1 }))).toBeNull();
  });

  it("serialize 往返一致；缺 startedAt 自动补当前时间", () => {
    const state = parseStateFile(serializeStateFile({ port: 8080, token: "toktoktoktok", serverPid: 2, startedAt: 5 }));
    expect(state).toEqual({ port: 8080, token: "toktoktoktok", serverPid: 2, startedAt: 5 });
  });

  it("stateFilePath 落在 cwd 的 .pi 目录（去尾斜杠）", () => {
    expect(stateFilePath("/repo")).toBe("/repo/.pi/web.json");
    expect(stateFilePath("/repo/")).toBe("/repo/.pi/web.json");
  });
});

describe("RegistryStore", () => {
  it("增删查与列表", () => {
    const store = new RegistryStore();
    store.add({ processId: HOST_PROCESS_ID, pid: 1, kind: "host", sessionFile: "/s/1.jsonl", sessionName: "a", cwd: "/r", connectedAt: 1 });
    store.add({ processId: "p-1", pid: 2, kind: "external", sessionFile: "/s/2.jsonl", sessionName: null, cwd: "/r", connectedAt: 2 });
    expect(store.list().map((e) => e.processId)).toEqual(["host", "p-1"]);
    expect(store.get("p-1")?.pid).toBe(2);
    store.remove("p-1");
    expect(store.get("p-1")).toBeNull();
    expect(store.list()).toHaveLength(1);
  });

  it("nextProcessId：host 固定；注册者从 p-1 递增且不冲突（host 在表也不影响）", () => {
    const store = new RegistryStore();
    store.add({ processId: HOST_PROCESS_ID, pid: 1, kind: "host", sessionFile: null, sessionName: null, cwd: "/r", connectedAt: 1 });
    expect(store.nextProcessId("host")).toBe(HOST_PROCESS_ID);
    expect(store.nextProcessId("external")).toBe("p-1");
    store.add({ processId: "p-1", pid: 2, kind: "external", sessionFile: null, sessionName: null, cwd: "/r", connectedAt: 1 });
    expect(store.nextProcessId("external")).toBe("p-2");
  });
});

describe("WebStateFile（web 服务独立进程：serverPid）", () => {
  it("新格式解析：serverPid", () => {
    const state = parseStateFile(
      JSON.stringify({ port: 3939, token: "abc12345def", serverPid: 456, startedAt: 1000 }),
    );
    expect(state).toEqual({ port: 3939, token: "abc12345def", serverPid: 456, startedAt: 1000 });
  });

  it("旧格式兼容：hostPid 解析为 serverPid", () => {
    const state = parseStateFile(
      JSON.stringify({ port: 3939, token: "abc12345def", hostPid: 123, startedAt: 1000 }),
    );
    expect(state).toEqual({ port: 3939, token: "abc12345def", serverPid: 123, startedAt: 1000 });
  });

  it("非法/缺字段仍拒绝", () => {
    expect(parseStateFile(JSON.stringify({ port: 3939, token: "short", serverPid: 1 }))).toBeNull();
    expect(parseStateFile(JSON.stringify({ token: "abcdefgh", serverPid: 1 }))).toBeNull();
    expect(parseStateFile("not json")).toBeNull();
  });

  it("序列化写 serverPid（不再写 hostPid）", () => {
    const state: WebStateFile = { port: 8080, token: "toktoktoktok", serverPid: 2, startedAt: 5 };
    const parsed = parseStateFile(serializeStateFile(state));
    expect(parsed).toEqual(state);
    expect(serializeStateFile(state)).not.toContain("hostPid");
  });
});
