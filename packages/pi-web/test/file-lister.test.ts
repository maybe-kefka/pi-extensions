import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { listFiles } from "../src/file-lister.js";

function makeTree(spec: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "piweb-files-"));
  for (const [rel, content] of Object.entries(spec)) {
    const abs = join(root, rel);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, content);
  }
  return root;
}

function flat(list: ReturnType<typeof listFiles>): string[] {
  return list.flatMap((g) => g.files.map((f) => f.path));
}

describe("listFiles — 基础", () => {
  it("根目录文件 + 子目录分组", () => {
    const root = makeTree({
      "a.ts": "",
      "b.ts": "",
      "src/c.ts": "",
      "src/deep/d.ts": "",
    });
    try {
      const r = listFiles(root, { maxDepth: 3 });
      expect(flat(r)).toEqual(["a.ts", "b.ts", "src/c.ts", "src/deep/d.ts"]);
      const src = r.find((g) => g.dir === "src");
      expect(src?.files).toEqual([{ name: "c.ts", path: "src/c.ts" }]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("空目录 / 无文件 → 空数组", () => {
    const root = mkdtempSync(join(tmpdir(), "piweb-files-"));
    try {
      mkdirSync(join(root, "empty"), { recursive: true });
      expect(listFiles(root)).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("listFiles — gitignore 排除", () => {
  it("根 .gitignore 规则生效（dist/、*.log）", () => {
    const root = makeTree({
      ".gitignore": "dist/\n*.log\n",
      "dist/bundle.js": "",
      "a.log": "",
      "keep.ts": "",
      "src/nested/dist/x.js": "",
    });
    try {
      expect(flat(listFiles(root))).toEqual([".gitignore", "keep.ts"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("嵌套 .gitignore 只作用于其子树", () => {
    const root = makeTree({
      ".gitignore": "*.tmp\n",
      "web/.gitignore": "dist\n",
      "web/dist/app.js": "",
      "web/src/app.ts": "",
      "other/dist/x.js": "",
      "a.tmp": "",
    });
    try {
      expect(flat(listFiles(root))).toEqual([".gitignore", "other/dist/x.js", "web/.gitignore", "web/src/app.ts"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it(".git 与 node_modules 始终排除（无论 gitignore）", () => {
    const root = makeTree({
      ".git/config": "",
      "node_modules/pkg/index.js": "",
      "src/ok.ts": "",
    });
    try {
      expect(flat(listFiles(root))).toEqual(["src/ok.ts"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("! 否定规则生效", () => {
    const root = makeTree({
      ".gitignore": "*.log\n!keep.log\n",
      "drop.log": "",
      "keep.log": "",
    });
    try {
      expect(flat(listFiles(root))).toEqual([".gitignore", "keep.log"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("listFiles — 深度与上限", () => {
  it("maxDepth=1 不进入更深目录", () => {
    const root = makeTree({
      "a.ts": "",
      "one/b.ts": "",
      "one/two/c.ts": "",
    });
    try {
      expect(flat(listFiles(root, { maxDepth: 1 }))).toEqual(["a.ts", "one/b.ts"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("limit 截断", () => {
    const root = makeTree({
      "a.ts": "",
      "b.ts": "",
      "c.ts": "",
      "d.ts": "",
    });
    try {
      expect(flat(listFiles(root, { limit: 3 }))).toEqual(["a.ts", "b.ts", "c.ts"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("默认 limit 200 / maxDepth 3", () => {
    const root = makeTree({
      "x.ts": "",
      "d1/d2/d3/y.ts": "",
      "d1/d2/d3/d4/z.ts": "",
    });
    try {
      expect(flat(listFiles(root))).toEqual(["x.ts", "d1/d2/d3/y.ts"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
