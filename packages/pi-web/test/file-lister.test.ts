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
  // 文件视角（旧断言）：只取非目录条目；目录条目由专门测试显式断言
  return list.flatMap((g) => g.files.filter((f) => !f.isDir).map((f) => f.path));
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
      // src 组：文件 c.ts + 子目录 deep（目录条目）
      expect(src?.files).toEqual([
        { name: "c.ts", path: "src/c.ts", isDir: false },
        { name: "deep", path: "src/deep", isDir: true },
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("目录条目：文件夹与文件平级输出（isDir=true，计入分组）", () => {
    const root = makeTree({
      "a.ts": "",
      "src/c.ts": "",
      "src/sub/deep.ts": "",
      "empty-dir/.keep": "",
    });
    try {
      const r = listFiles(root, { maxDepth: 2 });
      const rootGroup = r.find((g) => g.dir === ".");
      // 根目录：文件 a.ts + 目录 src（目录条目；empty-dir 也有 .keep → 目录条目存在）
      // readdir 字母序：a.ts → empty-dir → src
      expect(rootGroup?.files).toEqual([
        { name: "a.ts", path: "a.ts", isDir: false },
        { name: "empty-dir", path: "empty-dir", isDir: true },
        { name: "src", path: "src", isDir: true },
      ]);
      const srcGroup = r.find((g) => g.dir === "src");
      expect(srcGroup?.files).toContainEqual({ name: "sub", path: "src/sub", isDir: true });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("目录条目：gitignore 排除的目录不输出（dist/ 被忽略）", () => {
    const root = makeTree({
      ".gitignore": "dist/\n",
      "dist/bundle.js": "",
      "src/a.ts": "",
    });
    try {
      const r = listFiles(root, { maxDepth: 2 });
      expect(flat(r)).toEqual([".gitignore", "src/a.ts"]);
      const rootGroup = r.find((g) => g.dir === ".");
      // dist 被忽略 → 不出现目录条目（.gitignore 文件本身在列）
      expect(rootGroup?.files.map((f) => f.name)).toEqual([".gitignore", "src"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("limit 计入目录条目", () => {
    const root = makeTree({
      "a.ts": "",
      "src/c.ts": "",
      "src/deep/d.ts": "",
      "lib/e.ts": "",
    });
    try {
      const r = listFiles(root, { maxDepth: 3, limit: 4 });
      // 目录条目：根=src,lib（2）+ 文件 a.ts（1）= 3 个 root 条目；src 组 2 个
      const total = r.reduce((n, g) => n + g.files.length, 0);
      expect(total).toBeLessThanOrEqual(4);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("无任何内容 → 空数组；空目录 → 目录条目可见", () => {
    const root = mkdtempSync(join(tmpdir(), "piweb-files-"));
    try {
      // 完全为空 → 无输出
      expect(listFiles(root)).toEqual([]);
      // 空目录 → 目录条目（@ 面板可选择）
      mkdirSync(join(root, "empty"), { recursive: true });
      expect(listFiles(root)).toEqual([{ dir: ".", files: [{ name: "empty", path: "empty", isDir: true }] }]);
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
