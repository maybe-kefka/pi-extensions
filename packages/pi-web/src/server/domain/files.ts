/**
 * 文件安全域（SPEC files §Implementation Decisions Seam A）：路径白名单防护 +
 * 目录列举 + 文件分类。全部纯函数，fs 以最小接口注入（可单测）。
 * 安全约束：所有路径操作仅限 root 内（规范化 + `..` 逃逸拒绝 + symlink 不跟随）。
 */

import { createHash } from "node:crypto";
import { isAbsolute, join, normalize, posix, sep } from "node:path";

export type EntryType = "dir" | "file";

export interface DirEntry {
  name: string;
  type: EntryType;
  size: number;
  mtimeMs: number;
}

export interface ListDirOptions {
  /** 显示被排除目录（node_modules/.git/dist/.pi） */
  showExcluded?: boolean;
  /** 显示隐藏文件（dot 开头） */
  showHidden?: boolean;
}

export type FileMode = "text" | "binary" | "too-large";

export interface ReadFileResult {
  content: string;
  mode: FileMode;
  size: number;
  mtimeMs: number;
  /** 内容 sha256（冲突检测快照） */
  hash: string;
}

/** lstat 语义（symlink 不跟随，调用方据 isSymbolicLink 决定策略） */
export interface FsStat {
  isDirectory(): boolean;
  isFile(): boolean;
  isSymbolicLink(): boolean;
  size: number;
  mtimeMs: number;
}

export interface FsLike {
  readdir(dir: string): Promise<string[]>;
  /** lstat 语义 */
  stat(path: string): Promise<FsStat>;
  readFile(path: string): Promise<Buffer>;
}

/** 默认排除目录 */
const EXCLUDED_DIRS = new Set(["node_modules", ".git", "dist", ".pi"]);

/** 大文件阈值：超过即只读（text 模式拒绝保存） */
export const LARGE_FILE_BYTES = 500 * 1024;

/**
 * 路径规范化 + 白名单校验：返回 root 内的绝对路径，越权返回 null。
 * 拒绝：绝对路径、`..` 逃逸、NUL 字节、空白路径。
 */
export function resolveWithinRoot(root: string, relPath: string): string | null {
  if (relPath === "") return root;
  if (isAbsolute(relPath)) return null;
  if (relPath.includes("\0")) return null;
  if (relPath.trim() === "" || relPath !== relPath.trim()) return null;
  const normalized = normalize(relPath);
  if (normalized === ".." || normalized.startsWith(`..${sep}`)) return null;
  const abs = join(root, normalized);
  // join 后再归一化一次，防止 root 非规范化时逃逸
  if (!abs.startsWith(root === "/" ? "/" : `${normalize(root)}${sep}`) && abs !== normalize(root)) {
    return null;
  }
  return abs;
}

/** 相对路径规范化（供 RPC 返回；根目录返回空串） */
export function relOf(root: string, abs: string): string {
  const rel = abs === root ? "" : abs.slice(root.length).replace(/^[/\\]/, "");
  return rel.split(sep).join(posix.sep);
}

/** 目录列举（单目录，不递归）：过滤排除/隐藏 → 目录在前、名字排序 */
export async function listDir(
  root: string,
  relPath: string,
  opts: ListDirOptions,
  fs: FsLike,
): Promise<DirEntry[] | null> {
  const abs = resolveWithinRoot(root, relPath);
  if (!abs) return null;
  let names: string[];
  try {
    names = await fs.readdir(abs);
  } catch {
    return null;
  }
  const entries: DirEntry[] = [];
  for (const name of names) {
    const isHidden = name.startsWith(".");
    if (isHidden && !opts.showHidden) continue;
    if (!opts.showExcluded && EXCLUDED_DIRS.has(name)) continue;
    let st: FsStat;
    try {
      st = await fs.stat(join(abs, name));
    } catch {
      continue;
    }
    if (st.isSymbolicLink()) continue; // symlink 不跟随（防逃逸）
    entries.push({ name, type: st.isDirectory() ? "dir" : "file", size: st.size, mtimeMs: st.mtimeMs });
  }
  entries.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1));
  return entries;
}

/** 二进制嗅探：NUL 字节（全量扫描，不限于采样窗口） */
export function sniffBinary(buf: Buffer): boolean {
  return buf.includes(0);
}

/** 文件分类：>500KB → too-large；NUL 嗅探 → binary；否则 text */
export function classifyFile(size: number, buf: Buffer): FileMode {
  if (size > LARGE_FILE_BYTES) return "too-large";
  if (sniffBinary(buf)) return "binary";
  return "text";
}

/** 读取并分类文件；越权/不存在返回 null（不抛错） */
export async function readFileText(
  root: string,
  relPath: string,
  fs: FsLike,
): Promise<ReadFileResult | null> {
  const abs = resolveWithinRoot(root, relPath);
  if (!abs) return null;
  let buf: Buffer;
  let st: FsStat;
  try {
    [buf, st] = await Promise.all([fs.readFile(abs), fs.stat(abs)]);
  } catch {
    return null;
  }
  const mode = classifyFile(st.size, buf);
  return {
    content: mode === "text" ? buf.toString("utf8") : "",
    mode,
    size: st.size,
    mtimeMs: st.mtimeMs,
    hash: createHash("sha256").update(buf).digest("hex"),
  };
}

/** 冲突检测：期望快照（mtime + 哈希）与磁盘现状不一致 → 冲突 */
export function checkConflict(
  expectedHash: string | null,
  expectedMtimeMs: number | null,
  currentHash: string,
  currentMtimeMs: number,
): boolean {
  if (expectedHash === null || expectedMtimeMs === null) return true;
  return expectedHash !== currentHash || expectedMtimeMs !== currentMtimeMs;
}
