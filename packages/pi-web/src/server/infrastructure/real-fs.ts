/**
 * 真实文件系统适配（infrastructure 层）：把 node:fs 适配为文件安全域的 FsLike 最小接口。
 * lstat 语义（symlink 不跟随）——安全域靠此拒绝 symlink 逃逸。
 */

import { promises as fsp } from "node:fs";
import type { FsLike, FsStat } from "../domain/files.js";

export const realFs: FsLike = {
  async readdir(dir) {
    return fsp.readdir(dir);
  },
  async stat(path): Promise<FsStat> {
    const st = await fsp.lstat(path);
    return {
      isDirectory: () => st.isDirectory(),
      isFile: () => st.isFile(),
      isSymbolicLink: () => st.isSymbolicLink(),
      size: st.size,
      mtimeMs: st.mtimeMs,
    };
  },
  readFile(path) {
    return fsp.readFile(path);
  },
  writeFile(path, content) {
    return fsp.writeFile(path, content);
  },
};
