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
  it("按文件状态返回稳定的语义变量", () => {
    expect(statusColorVar("M")).toBe("var(--warning)");
    expect(statusColorVar("A")).toBe("var(--success)");
    expect(statusColorVar("D")).toBe("var(--destructive)");
    expect(statusColorVar("U")).toBe("var(--destructive)");
    expect(statusColorVar("??")).toBe("var(--muted-foreground)");
  });
});
