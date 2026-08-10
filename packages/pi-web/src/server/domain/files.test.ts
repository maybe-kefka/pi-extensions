import { describe, expect, it } from "vitest";
import {
  checkConflict,
  listDir,
  readFileText,
  resolveWithinRoot,
  sniffBinary,
  writeFileText,
  type FsLike,
} from "./files.js";

/** 内存假 fs（lstat 语义：symlink 不跟随，直接报 isSymbolicLink）；writeFile 后内容可变 */
function memFs(files: Record<string, string | Buffer>, symlinks: string[] = []): FsLike & { readFileSync(path: string): string } {
  const store: Record<string, string | Buffer> = { ...files };
  const all = () => new Set(Object.keys(store));
  return {
    async readdir(dir) {
      const keys = all();
      const prefix = dir.endsWith("/") ? dir : `${dir}/`;
      if (!keys.has(dir) && ![...keys].some((p) => p.startsWith(prefix))) throw new Error(`ENOENT ${dir}`);
      const names = new Set<string>();
      for (const p of keys) {
        if (!p.startsWith(prefix)) continue;
        const rest = p.slice(prefix.length);
        const first = rest.split("/")[0];
        if (first) names.add(first);
      }
      return [...names].sort();
    },
    async stat(path) {
      const keys = all();
      if (symlinks.includes(path)) {
        return { isDirectory: () => false, isFile: () => false, isSymbolicLink: () => true, size: 0, mtimeMs: 0 };
      }
      // 目录 stat：路径是某键的祖先（如 /repo/src 之于 /repo/src/main.ts）
      const isDir = [...keys].some((p) => p.startsWith(`${path}/`));
      if (isDir) {
        return { isDirectory: () => true, isFile: () => false, isSymbolicLink: () => false, size: 0, mtimeMs: 1000 };
      }
      if (!keys.has(path)) throw new Error(`ENOENT ${path}`);
      const content = store[path];
      return {
        isDirectory: () => false,
        isFile: () => true,
        isSymbolicLink: () => false,
        size: typeof content === "string" ? Buffer.byteLength(content) : content.length,
        mtimeMs: 1000,
      };
    },
    async readFile(path) {
      const keys = all();
      if (!keys.has(path)) throw new Error(`ENOENT ${path}`);
      const content = store[path];
      return typeof content === "string" ? Buffer.from(content) : content;
    },
    async writeFile(path, content) {
      store[path] = content.toString();
    },
    readFileSync(path) {
      return typeof store[path] === "string" ? (store[path] as string) : "<buffer>";
    },
  };
}

describe("resolveWithinRoot", () => {
  const root = "/repo";

  it("正常相对路径返回规范化绝对路径", () => {
    expect(resolveWithinRoot(root, "src/index.ts")).toBe("/repo/src/index.ts");
    expect(resolveWithinRoot(root, "./src/./index.ts")).toBe("/repo/src/index.ts");
    expect(resolveWithinRoot(root, "a/b/../c.ts")).toBe("/repo/a/c.ts");
  });

  it("空路径等价根目录", () => {
    expect(resolveWithinRoot(root, "")).toBe("/repo");
  });

  it("拒绝 .. 逃逸", () => {
    expect(resolveWithinRoot(root, "../etc/passwd")).toBeNull();
    expect(resolveWithinRoot(root, "a/../../etc")).toBeNull();
  });

  it("拒绝绝对路径", () => {
    expect(resolveWithinRoot(root, "/etc/passwd")).toBeNull();
  });

  it("拒绝含 NUL 或空白的畸形路径", () => {
    expect(resolveWithinRoot(root, "a\0b")).toBeNull();
    expect(resolveWithinRoot(root, "  ")).toBeNull();
  });
});

describe("listDir", () => {
  const fs = memFs({
    "/repo/src/main.ts": "x",
    "/repo/src/util.ts": "y",
    "/repo/src/deep/nested.ts": "z",
    "/repo/README.md": "r",
    "/repo/node_modules/pkg/index.js": "n",
    "/repo/.git/config": "g",
    "/repo/dist/bundle.js": "b",
    "/repo/.env": "e",
  });

  it("返回单目录条目（不递归），目录在前、名字排序", async () => {
    const entries = await listDir("/repo", "", {}, fs);
    expect(entries?.map((e) => `${e.type}:${e.name}`)).toEqual(["dir:src", "file:README.md"]);
  });

  it("默认排除 node_modules/.git/dist 与隐藏文件", async () => {
    const entries = await listDir("/repo", "", {}, fs);
    expect(entries?.some((e) => ["node_modules", ".git", "dist", ".env"].includes(e.name))).toBe(false);
  });

  it("showExcluded 显示排除目录，showHidden 显示隐藏文件", async () => {
    const entries = await listDir("/repo", "", { showExcluded: true, showHidden: true }, fs);
    expect(entries?.map((e) => e.name).sort()).toEqual([".env", ".git", "README.md", "dist", "node_modules", "src"]);
  });

  it("只显示排除目录不显示隐藏文件（反之亦然）", async () => {
    const ex = await listDir("/repo", "", { showExcluded: true }, fs);
    expect(ex?.some((e) => e.name === ".env")).toBe(false);
    expect(ex?.some((e) => e.name === "dist")).toBe(true);
    const hid = await listDir("/repo", "", { showHidden: true }, fs);
    expect(hid?.some((e) => e.name === ".env")).toBe(true);
    expect(hid?.some((e) => e.name === "dist")).toBe(false);
  });

  it("子目录展开返回相对条目", async () => {
    const entries = await listDir("/repo", "src", {}, fs);
    expect(entries?.map((e) => `${e.type}:${e.name}`)).toEqual(["dir:deep", "file:main.ts", "file:util.ts"]);
  });

  it("越权路径返回 null（不抛错）", async () => {
    expect(await listDir("/repo", "../etc", {}, fs)).toBeNull();
  });

  it("不存在目录返回 null", async () => {
    expect(await listDir("/repo", "nope", {}, fs)).toBeNull();
  });

  it("symlink 条目不列出（防逃逸）", async () => {
    const sym = memFs({ "/repo/link.ts": "l", "/repo/real.ts": "r" }, ["/repo/link.ts"]);
    const entries = await listDir("/repo", "", {}, sym);
    expect(entries?.map((e) => e.name)).toEqual(["real.ts"]);
  });
});

describe("sniffBinary", () => {
  it("NUL 字节判为二进制", () => {
    expect(sniffBinary(Buffer.from([0x68, 0x69, 0x00, 0x0a]))).toBe(true);
  });

  it("纯文本（含 UTF-8 中文）不是二进制", () => {
    expect(sniffBinary(Buffer.from("const a = 1;\n// 中文注释\n"))).toBe(false);
  });

  it("空文件不是二进制", () => {
    expect(sniffBinary(Buffer.alloc(0))).toBe(false);
  });

  it("二进制标记出现在 8KB 采样窗口之后也被捕获（全量扫描）", () => {
    const buf = Buffer.alloc(9000, 0x41);
    buf[8999] = 0x00;
    expect(sniffBinary(buf)).toBe(true);
  });
});

describe("readFileText", () => {
  it("文本文件返回内容与快照元数据", async () => {
    const fs = memFs({ "/repo/a.ts": "export const x = 1;\n" });
    const r = await readFileText("/repo", "a.ts", fs);
    expect(r?.content).toBe("export const x = 1;\n");
    expect(r?.mode).toBe("text");
    expect(r?.size).toBe(20);
    expect(r?.mtimeMs).toBe(1000);
    expect(r?.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("超过 500KB 返回 too-large（内容为空）", async () => {
    const big = Buffer.alloc(500 * 1024 + 1, 0x61);
    const fs = memFs({ "/repo/big.txt": big });
    const r = await readFileText("/repo", "big.txt", fs);
    expect(r?.mode).toBe("too-large");
    expect(r?.content).toBe("");
  });

  it("恰好 500KB 可读", async () => {
    const big = Buffer.alloc(500 * 1024, 0x61);
    const fs = memFs({ "/repo/big.txt": big });
    const r = await readFileText("/repo", "big.txt", fs);
    expect(r?.mode).toBe("text");
  });

  it("二进制文件返回 binary 模式", async () => {
    const fs = memFs({ "/repo/img.png": Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x0a]) });
    const r = await readFileText("/repo", "img.png", fs);
    expect(r?.mode).toBe("binary");
    expect(r?.content).toBe("");
  });

  it("越权路径返回 null", async () => {
    const fs = memFs({ "/repo/a.ts": "x" });
    expect(await readFileText("/repo", "../a.ts", fs)).toBeNull();
  });

  it("不存在的文件返回 null（不抛错）", async () => {
    const fs = memFs({});
    expect(await readFileText("/repo", "nope.ts", fs)).toBeNull();
  });
});

describe("checkConflict", () => {
  it("哈希与 mtime 均一致 → 无冲突", () => {
    expect(checkConflict("abc", 1000, "abc", 1000)).toBe(false);
  });

  it("哈希不一致 → 冲突", () => {
    expect(checkConflict("abc", 1000, "abd", 1000)).toBe(true);
  });

  it("mtime 不一致 → 冲突", () => {
    expect(checkConflict("abc", 1000, "abc", 1001)).toBe(true);
  });

  it("缺少期望快照（首次打开旧文件）→ 视为冲突", () => {
    expect(checkConflict(null, null, "abc", 1000)).toBe(true);
  });
});

describe("writeFileText", () => {
  it("快照一致时写入成功", async () => {
    const fs = memFs({ "/repo/a.ts": "old" });
    const snap = await readFileText("/repo", "a.ts", fs);
    const r = await writeFileText("/repo", "a.ts", "new", { hash: snap!.hash, mtimeMs: snap!.mtimeMs }, fs);
    expect(r?.ok).toBe(true);
    expect(fs.readFileSync("/repo/a.ts")).toBe("new");
  });

  it("快照不一致返回 conflict（不写入）", async () => {
    const fs = memFs({ "/repo/a.ts": "old" });
    const r = await writeFileText("/repo", "a.ts", "new", { hash: "wrong", mtimeMs: 1000 }, fs);
    expect(r?.ok).toBe(false);
    if (r && !r.ok) expect(r.reason).toBe("conflict");
    expect(fs.readFileSync("/repo/a.ts")).toBe("old");
  });

  it("mtime 不一致也判 conflict", async () => {
    const fs = memFs({ "/repo/a.ts": "old" });
    const snap = await readFileText("/repo", "a.ts", fs);
    const r = await writeFileText("/repo", "a.ts", "new", { hash: snap!.hash, mtimeMs: snap!.mtimeMs + 1 }, fs);
    if (r && !r.ok) expect(r.reason).toBe("conflict");
  });

  it("越权路径返回 denied（不抛错）", async () => {
    const fs = memFs({ "/repo/a.ts": "old" });
    const r = await writeFileText("/repo", "../a.ts", "new", { hash: "h", mtimeMs: 1000 }, fs);
    expect(r?.ok).toBe(false);
    if (r && !r.ok) expect(r.reason).toBe("denied");
  });

  it("不存在的文件返回 not-found", async () => {
    const fs = memFs({});
    const r = await writeFileText("/repo", "nope.ts", "x", { hash: null, mtimeMs: null }, fs);
    if (r && !r.ok) expect(r.reason).toBe("not-found");
  });
});
