import { describe, expect, it } from "vitest";
import { statusColorVar, statusMarker } from "./git-status.js";

describe("statusMarker", () => {
  it("常见状态映射", () => {
    expect(statusMarker("M")).toBe("M");
    expect(statusMarker("A")).toBe("A");
    expect(statusMarker("D")).toBe("D");
    expect(statusMarker("??")).toBe("?");
    expect(statusMarker("U")).toBe("!");
  });

  it("未知状态返回空", () => {
    expect(statusMarker("R")).toBe("");
    expect(statusMarker("")).toBe("");
  });
});

describe("statusColorVar", () => {
  it("全部返回语义变量", () => {
    for (const s of ["M", "A", "D", "U", "??"]) {
      expect(statusColorVar(s)).toMatch(/^var\(--/);
    }
  });
});
