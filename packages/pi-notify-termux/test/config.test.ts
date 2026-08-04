import { describe, expect, it } from "vitest";
import {
  buildConfigPaths,
  defaultConfig,
  parseConfig,
  parseNotifyCommand,
  renderStatus,
} from "../src/config.js";

const HOME = "/data/data/com.termux/files/home";

describe("buildConfigPaths", () => {
  it("builds paths under <home>/<configDirName>/pi-notify-termux", () => {
    const p = buildConfigPaths(HOME, ".pi");
    expect(p.dir).toBe(`${HOME}/.pi/pi-notify-termux`);
    expect(p.configFile).toBe(`${HOME}/.pi/pi-notify-termux/config.json`);
    expect(p.helperFile).toBe(`${HOME}/.pi/pi-notify-termux/helper.sh`);
    expect(p.repliesDir).toBe(`${HOME}/.pi/pi-notify-termux/replies`);
  });

  it("honors a custom config dir name (no hardcoded .pi)", () => {
    const p = buildConfigPaths(HOME, "custom");
    expect(p.configFile).toBe(`${HOME}/custom/pi-notify-termux/config.json`);
  });
});

describe("parseConfig", () => {
  it("defaults on empty object and garbage", () => {
    expect(parseConfig("{}")).toEqual(defaultConfig);
    expect(parseConfig("not json")).toEqual(defaultConfig);
    expect(parseConfig("")).toEqual(defaultConfig);
    expect(parseConfig("[]")).toEqual(defaultConfig);
    expect(parseConfig("null")).toEqual(defaultConfig);
  });

  it("keeps valid fields", () => {
    expect(parseConfig('{"enabled": false, "timeoutSec": 600}')).toEqual({
      enabled: false,
      timeoutSec: 600,
    });
    expect(parseConfig('{"enabled": true}')).toEqual({ enabled: true, timeoutSec: 300 });
  });

  it("falls back per-field on invalid values", () => {
    expect(parseConfig('{"enabled": "yes"}')).toEqual(defaultConfig);
    expect(parseConfig('{"enabled": true, "timeoutSec": -5}')).toEqual({ enabled: true, timeoutSec: 300 });
    expect(parseConfig('{"enabled": false, "timeoutSec": 1.5}')).toEqual({ enabled: false, timeoutSec: 300 });
    expect(parseConfig('{"enabled": true, "timeoutSec": "fast"}')).toEqual(defaultConfig);
  });
});

describe("parseNotifyCommand", () => {
  it("parses on/off/status", () => {
    expect(parseNotifyCommand("on")).toEqual({ action: "on" });
    expect(parseNotifyCommand("off")).toEqual({ action: "off" });
    expect(parseNotifyCommand("")).toEqual({ action: "status" });
    expect(parseNotifyCommand(undefined)).toEqual({ action: "status" });
  });

  it("rejects unknown args with usage hint", () => {
    const r = parseNotifyCommand("whatever");
    if (!("error" in r)) throw new Error("expected error result");
    expect(r.error).toContain("on|off");
  });
});

describe("renderStatus", () => {
  it("renders enabled state with environment hints", () => {
    expect(renderStatus({ enabled: true, envOk: true })).toContain("已开启");
    expect(renderStatus({ enabled: false, envOk: true })).toContain("已关闭");
    expect(renderStatus({ enabled: true, envOk: false })).toContain("termux-api");
  });
});
