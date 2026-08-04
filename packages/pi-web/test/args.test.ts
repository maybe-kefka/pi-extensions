import { describe, expect, it } from "vitest";
import { parseArgs, USAGE } from "../src/args.js";

describe("parseArgs", () => {
  it("缺省参数 → 随机端口，不打开，不停止", () => {
    expect(parseArgs(undefined)).toEqual({ ok: true, value: { port: 0, open: false, stop: false } });
    expect(parseArgs("")).toEqual({ ok: true, value: { port: 0, open: false, stop: false } });
    expect(parseArgs("   ")).toEqual({ ok: true, value: { port: 0, open: false, stop: false } });
  });

  it("--port <n> / --port=<n> / -p <n> / -p=<n> 四种写法等价", () => {
    const expected = { ok: true, value: { port: 8080, open: false, stop: false } };
    expect(parseArgs("--port 8080")).toEqual(expected);
    expect(parseArgs("--port=8080")).toEqual(expected);
    expect(parseArgs("-p 8080")).toEqual(expected);
    expect(parseArgs("-p=8080")).toEqual(expected);
  });

  it("--port 0 表示随机", () => {
    expect(parseArgs("--port 0")).toEqual({ ok: true, value: { port: 0, open: false, stop: false } });
  });

  it("--open 与 --stop 布尔", () => {
    expect(parseArgs("--open")).toEqual({ ok: true, value: { port: 0, open: true, stop: false } });
    expect(parseArgs("--stop")).toEqual({ ok: true, value: { port: 0, open: false, stop: true } });
    expect(parseArgs("--port 3000 --open --stop")).toEqual({
      ok: true,
      value: { port: 3000, open: true, stop: true },
    });
  });

  it("重复 --port 后者覆盖（last-wins）", () => {
    expect(parseArgs("--port 1111 --port 2222")).toEqual({
      ok: true,
      value: { port: 2222, open: false, stop: false },
    });
  });

  it("非法端口报错", () => {
    expect(parseArgs("--port abc").ok).toBe(false);
    expect(parseArgs("--port -1").ok).toBe(false);
    expect(parseArgs("--port 65536").ok).toBe(false);
    expect(parseArgs("--port 1.5").ok).toBe(false);
  });

  it("--port 缺值报错", () => {
    expect(parseArgs("--port").ok).toBe(false);
    expect(parseArgs("--port --open").ok).toBe(false);
  });

  it("未知参数报错并附用法", () => {
    const r = parseArgs("--bogus");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(USAGE);
  });

  it("多余尾随 token 报错", () => {
    expect(parseArgs("--port 8080 123").ok).toBe(false);
  });
});
