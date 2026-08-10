import { describe, expect, it } from "vitest";
import { probePrivileged } from "./privilege-probe.js";

describe("probePrivileged", () => {
  it("null（未捕获特权）→ false", () => {
    expect(probePrivileged(null)).toBe(false);
  });

  it("正常特权 ctx → true", () => {
    expect(probePrivileged({ getSystemPromptOptions: () => ({}) })).toBe(true);
  });

  it("stale 特权 ctx（assertActive 抛错）→ false", () => {
    const stale = {
      getSystemPromptOptions: () => {
        throw new Error("This extension ctx is stale after session replacement or reload");
      },
    };
    expect(probePrivileged(stale)).toBe(false);
  });

  it("其他异常 → false", () => {
    const broken = {
      getSystemPromptOptions: () => {
        throw new Error("boom");
      },
    };
    expect(probePrivileged(broken)).toBe(false);
  });
});
