import { describe, expect, it } from "vitest";
import { webServiceSpawnSpec } from "./spawn-spec.js";

describe("webServiceSpawnSpec（服务进程 spawn 参数——argv 顺序/env 教训）", () => {
  it("argv：pi 入口 + --mode rpc + --extension <扩展入口>", () => {
    const spec = webServiceSpawnSpec({
      execPath: "/usr/bin/node",
      piEntry: "/opt/pi/cli.js",
      extensionPath: "/repo/pi-web/src/index.ts",
    });
    expect(spec.argv).toEqual([
      "/opt/pi/cli.js",
      "--mode",
      "rpc",
      "--extension",
      "/repo/pi-web/src/index.ts",
    ]);
    expect(spec.execPath).toBe("/usr/bin/node");
  });

  it("env：新增 PI_WEB_SERVICE=1（pi CLI 未知参数报错→env 标志）", () => {
    const spec = webServiceSpawnSpec({ execPath: "node", piEntry: "pi", extensionPath: "ext" });
    expect(spec.env).toEqual({ PI_WEB_SERVICE: "1" });
  });

  it("路径含空格/特殊字符不转义（数组传参——无引号问题）", () => {
    const spec = webServiceSpawnSpec({
      execPath: "node",
      piEntry: "/path with space/pi/cli.js",
      extensionPath: "/repo with space/pi-web/src/index.ts",
    });
    expect(spec.argv[0]).toBe("/path with space/pi/cli.js");
    expect(spec.argv.at(-1)).toBe("/repo with space/pi-web/src/index.ts");
  });
});
