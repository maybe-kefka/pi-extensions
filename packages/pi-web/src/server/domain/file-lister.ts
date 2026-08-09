/**
 * 工作目录文件扫描（SPEC §4.4 `pi:listFiles`）：gitignore 排除 + 深度/上限 + 目录分组。
 * gitignore 语义：根 .gitignore + 逐层嵌套 .gitignore（每层规则匹配相对该层目录的路径）。
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import ignore, { type Ignore } from "ignore";

export interface ListedFile {
  name: string;
  path: string;
  /** 是否目录条目（R17：@ 面板文件/文件夹平级展示） */
  isDir: boolean;
}

export interface FileGroup {
  dir: string;
  files: ListedFile[];
}

export interface ListFilesOptions {
  /** 目录递归深度（默认 3） */
  maxDepth?: number;
  /** 文件总数上限（默认 200，超出即截断） */
  limit?: number;
}

interface IgLayer {
  ig: Ignore;
  baseDir: string;
}

function readGitignore(dir: string): Ignore | null {
  const p = join(dir, ".gitignore");
  if (!existsSync(p)) return null;
  try {
    return ignore().add(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

export function listFiles(cwd: string, opts: ListFilesOptions = {}): FileGroup[] {
  const maxDepth = opts.maxDepth ?? 3;
  const limit = opts.limit ?? 200;
  const groups = new Map<string, ListedFile[]>();
  let count = 0;
  let truncated = false;

  const rootIg = readGitignore(cwd);
  const layers: IgLayer[] = rootIg ? [{ ig: rootIg, baseDir: cwd }] : [];

  function isIgnored(abs: string, myLayers: IgLayer[], isDir: boolean): boolean {
    for (const layer of myLayers) {
      const rel = relative(layer.baseDir, abs);
      if (rel !== "" && !rel.startsWith(`..${sep}`)) {
        // ignore 包的目录规则（dist/）需要尾斜杠才能匹配目录本身
        const target = isDir ? `${rel}/` : rel;
        if (layer.ig.ignores(target)) return true;
      }
    }
    return false;
  }

  function walk(dir: string, depth: number, ancestors: IgLayer[]): void {
    if (truncated) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    const gi = readGitignore(dir);
    const myLayers: IgLayer[] = gi ? [...ancestors, { ig: gi, baseDir: dir }] : ancestors;
    const relDir = relative(cwd, dir) || ".";

    for (const e of entries) {
      if (truncated) return;
      if (e.name === ".git" || e.name === "node_modules") continue;
      const abs = join(dir, e.name);
      if (isIgnored(abs, myLayers, e.isDirectory())) continue;
      const list = groups.get(relDir) ?? [];
      if (e.isDirectory()) {
        // 目录条目（平级可选中）+ 递归下钻
        list.push({ name: e.name, path: relative(cwd, abs), isDir: true });
        groups.set(relDir, list);
        count += 1;
        if (count >= limit) truncated = true;
        if (!truncated && depth + 1 <= maxDepth) walk(abs, depth + 1, myLayers);
      } else if (e.isFile()) {
        list.push({ name: e.name, path: relative(cwd, abs), isDir: false });
        groups.set(relDir, list);
        count += 1;
        if (count >= limit) truncated = true;
      }
    }
  }

  walk(cwd, 0, layers);

  return [...groups.entries()]
    .sort((a, b) => {
      if (a[0] === ".") return -1;
      if (b[0] === ".") return 1;
      return a[0].localeCompare(b[0]);
    })
    .map(([dir, files]) => ({ dir, files }));
}
