import { describe, expect, it } from "vitest";
import {
  buildAskContent,
  buildResultContent,
  buildTitle,
  hasContent,
} from "../src/format.js";

describe("buildTitle", () => {
  it("formats result title with zero-padded HH:MM", () => {
    expect(buildTitle("result", new Date(2025, 0, 1, 9, 5))).toBe("✅ pi · 09:05");
    expect(buildTitle("result", new Date(2025, 0, 1, 23, 59))).toBe("✅ pi · 23:59");
  });

  it("formats ask title", () => {
    expect(buildTitle("ask", new Date(2025, 0, 1, 12, 30))).toBe("❓ pi 提问 · 12:30");
  });
});

describe("buildResultContent", () => {
  it("returns the final reply text verbatim", () => {
    expect(buildResultContent("已帮你完成备份 ✅")).toBe("已帮你完成备份 ✅");
  });

  it("preserves multiline text", () => {
    expect(buildResultContent("第一行\n第二行")).toBe("第一行\n第二行");
  });
});

describe("buildAskContent", () => {
  it("renders question only when no options", () => {
    expect(buildAskContent("要继续吗？")).toBe("要继续吗？");
    expect(buildAskContent("要继续吗？", [])).toBe("要继续吗？");
  });

  it("renders numbered option list", () => {
    expect(buildAskContent("继续构建？", ["继续", "跳过"])).toBe(
      "继续构建？\n1) 继续\n2) 跳过",
    );
  });
});

describe("hasContent", () => {
  it("returns false for empty or whitespace-only text", () => {
    expect(hasContent("")).toBe(false);
    expect(hasContent("   \n\t ")).toBe(false);
  });

  it("returns true for any non-whitespace text", () => {
    expect(hasContent("ok")).toBe(true);
    expect(hasContent(" \n x ")).toBe(true);
  });
});
