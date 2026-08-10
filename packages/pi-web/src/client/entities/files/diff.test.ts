import { describe, expect, it } from "vitest";
import { diffStats, flattenDiff, type DiffHunkDto } from "./diff.js";

const hunks: DiffHunkDto[] = [
  {
    header: "@@ -1,3 +1,4 @@",
    lines: [
      { type: "ctx", text: " const a = 1;" },
      { type: "del", text: "const b = 2;" },
      { type: "add", text: "const b = 3;" },
      { type: "add", text: "const c = 4;" },
    ],
  },
  {
    header: "@@ -9 +10 @@",
    lines: [{ type: "ctx", text: " const d = 5;" }],
  },
];

describe("flattenDiff", () => {
  it("hunk 头与行按顺序平铺", () => {
    expect(flattenDiff(hunks)).toEqual([
      { kind: "hunk", text: "@@ -1,3 +1,4 @@" },
      { kind: "ctx", text: " const a = 1;" },
      { kind: "del", text: "const b = 2;" },
      { kind: "add", text: "const b = 3;" },
      { kind: "add", text: "const c = 4;" },
      { kind: "hunk", text: "@@ -9 +10 @@" },
      { kind: "ctx", text: " const d = 5;" },
    ]);
  });

  it("空输入返回空数组", () => {
    expect(flattenDiff([])).toEqual([]);
  });
});

describe("diffStats", () => {
  it("统计增删行数", () => {
    expect(diffStats(hunks)).toEqual({ add: 2, del: 1 });
  });

  it("无改动返回零", () => {
    expect(diffStats([])).toEqual({ add: 0, del: 0 });
  });
});
