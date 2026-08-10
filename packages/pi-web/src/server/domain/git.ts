import { join } from "node:path";
import { resolveWithinRoot, type FsLike } from "./files.js";

/**
 * git 域（SPEC files §Implementation Decisions Seam B）：只读白名单 + unified diff 解析 + repo 信息。
 * 全部纯函数，git 执行以 runner 注入（实现走 spawn shell:false——无 shell 注入面）。
 * 安全：白名单外的命令/标志一律拒绝；--output 类写文件标志明确禁止。
 */

export interface GitRunner {
  (args: string[]): Promise<{ code: number; stdout: string; stderr: string }>;
}

export type DiffLineType = "add" | "del" | "ctx";

export interface DiffLine {
  type: DiffLineType;
  text: string;
}

export interface DiffHunk {
  header: string;
  lines: DiffLine[];
}

export interface RepoInfo {
  isRepo: boolean;
  repoRoot?: string;
  branch?: string;
  /** 位于 linked worktree（--git-dir 与 --git-common-dir 不同） */
  worktree?: boolean;
}

export type GitAllowResult = { ok: true } | { ok: false; error: string };

/** 每命令允许的精确标志集合（保守白名单；`--` 后的路径段单独处理） */
const ALLOWED_FLAGS: Record<string, Set<string>> = {
  diff: new Set(["--cached", "--stat", "--numstat", "--name-only", "--no-color", "--unified"]),
  status: new Set(["--short", "--porcelain", "--branch", "--no-color"]),
  log: new Set(["--oneline", "--max-count", "--no-color"]),
  show: new Set(["--stat", "--no-color"]),
  "rev-parse": new Set(["--is-inside-work-tree", "--show-toplevel", "--abbrev-ref", "--git-dir", "--git-common-dir", "--short"]),
  branch: new Set(["--show-current", "-a", "-r", "-v", "--no-color"]),
};

const HASH_OR_HEAD_RE = /^(?:[0-9a-f]{7,40}|HEAD)$/;

/**
 * git 只读白名单校验。
 * 规则：
 * - 命令必须 ∈ {diff, status, log, show, rev-parse, branch}
 * - 以 - 开头的参数必须是该命令允许的标志（--unified=3 / --max-count=10 支持 = 值形式；--unified 3 分离值形式拒绝）
 * - 含 "output" 的任何标志一律拒绝（git 写文件面）
 * - 自由参数（非 - 开头）仅允许出现在 `--` 分隔符之后（路径段）；rev-parse 的 HEAD 例外仅限预设查询
 */
export function assertReadOnlyGit(args: string[]): GitAllowResult {
  const [cmd, ...rest] = args;
  if (!cmd) return { ok: false, error: "git 命令为空" };
  const flags = ALLOWED_FLAGS[cmd];
  if (!flags) return { ok: false, error: `命令不在只读白名单：${cmd}` };

  let afterSep = false;
  for (const arg of rest) {
    if (arg === "--") {
      afterSep = true;
      continue;
    }
    if (afterSep) continue; // `--` 之后均为路径段
    if (arg.startsWith("-")) {
      if (arg.includes("output")) return { ok: false, error: `拒绝写文件标志：${arg}` };
      const name = arg.includes("=") ? arg.slice(0, arg.indexOf("=")) : arg;
      if (!flags.has(name)) return { ok: false, error: `标志不在白名单：${arg}` };
      if (arg.includes("=") && !flags.has(arg)) {
        // 形如 --unified=3：名称在白名单且不要求精确值
      }
    } else {
      // 自由参数：diff 允许 HEAD/短哈希（vs HEAD 是核心用法）；其余拒绝
      if (cmd === "diff" && HASH_OR_HEAD_RE.test(arg)) continue;
      return { ok: false, error: `自由参数拒绝：${arg}` };
    }
  }
  return { ok: true };
}

/** unified diff → 结构化 hunk（文件头/索引/---/+++ 行忽略） */
export function parseGitDiff(text: string): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  let current: DiffHunk | null = null;
  for (const raw of text.split("\n")) {
    const line = raw;
    if (line === "") continue; // 结尾换行产生的空段
    if (line.startsWith("@@")) {
      current = { header: line, lines: [] };
      hunks.push(current);
      continue;
    }
    if (!current) continue;
    if (line === "\\ No newline at end of file") continue; // 并入前一行语义
    if (line.startsWith("+")) {
      current.lines.push({ type: "add", text: line.slice(1) });
    } else if (line.startsWith("-")) {
      current.lines.push({ type: "del", text: line.slice(1) });
    } else {
      // 上下文行保留原始文本（含前导空格，供前端渲染）
      current.lines.push({ type: "ctx", text: line });
    }
  }
  return hunks;
}

/** repo 信息：is-inside-work-tree → toplevel/branch/git-dir/common-dir */
export async function repoInfo(cwd: string, git: GitRunner): Promise<RepoInfo> {
  const probe = await git(["rev-parse", "--is-inside-work-tree"]);
  if (probe.code !== 0 || probe.stdout.trim() !== "true") {
    return { isRepo: false };
  }
  const [top, branch, gitDir, commonDir] = await Promise.all([
    git(["rev-parse", "--show-toplevel"]),
    git(["rev-parse", "--abbrev-ref", "HEAD"]),
    git(["rev-parse", "--git-dir"]),
    git(["rev-parse", "--git-common-dir"]),
  ]);
  const repoRoot = top.stdout.trim() || undefined;
  return {
    isRepo: true,
    repoRoot,
    branch: branch.stdout.trim() || undefined,
    worktree: gitDir.stdout.trim() !== commonDir.stdout.trim(),
  };
}

/** 单文件 vs HEAD diff（只读）：非 git → isRepo:false；无改动 → diff:null */
export type FileDiffResult = { isRepo: false } | { isRepo: true; diff: DiffHunk[] | null };

export async function fileDiff(cwd: string, relPath: string, git: GitRunner): Promise<FileDiffResult> {
  const probe = await git(["rev-parse", "--is-inside-work-tree"]);
  if (probe.code !== 0 || probe.stdout.trim() !== "true") {
    return { isRepo: false };
  }
  const allow = assertReadOnlyGit(["diff", "HEAD", "--", relPath]);
  if (!allow.ok) return { isRepo: true, diff: null };
  const r = await git(["diff", "HEAD", "--", relPath]);
  const out = r.stdout;
  if (out.trim() === "") return { isRepo: true, diff: null };
  return { isRepo: true, diff: parseGitDiff(out) };
}

/** porcelain 条目（XY 双列：X=staged 位 / Y=工作区位；?? 未跟踪） */
export interface PorcelainEntry {
  path: string;
  status: string;
  staged: boolean;
}

/** git status --porcelain=v1 解析；非仓库/空输出 → [] */
export function parsePorcelain(stdout: string): PorcelainEntry[] {
  const entries: PorcelainEntry[] = [];
  for (const raw of stdout.split("\n")) {
    if (raw.trim() === "" || raw.startsWith("fatal:")) continue;
    const x = raw[0];
    const y = raw[1];
    const rest = raw.slice(3);
    if (x === undefined || y === undefined || rest === undefined) continue;
    // 重命名/复制格式 "R  old -> new"（含引号转义）——取目标路径
    let path = rest;
    const arrow = path.indexOf(" -> ");
    if (arrow !== -1) path = path.slice(arrow + 4);
    // 状态码：?? 未跟踪；U 冲突；X 位（staged）优先；否则 Y 位
    let status: string;
    if (x === "?") status = "??";
    else if (x === "U" || y === "U") status = "U";
    else if (x !== " " && x !== ".") status = x;
    else status = y;
    entries.push({ path, status, staged: x !== " " && x !== "?" && x !== "." });
  }
  return entries;
}

/** 目录聚合：文件 → 自身 + 所有祖先目录（目录标记取首个子级状态） */
export function aggregateStatus(entries: PorcelainEntry[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const e of entries) {
    const parts = e.path.split("/");
    for (let i = 1; i <= parts.length; i++) {
      const key = parts.slice(0, i).join("/");
      if (!map.has(key)) map.set(key, e.status);
    }
  }
  return map;
}

/** git 写操作确认类型（前端弹窗第二道闸） */
export type GitConfirm = "merge" | "rebase" | "delete-branch";

export type GitOpAllow = { ok: true; confirm?: GitConfirm } | { ok: false; error: string };

/** 写命令白名单（vscode-align 05）：放行 + 破坏性拒绝 + 确认分层 */
const ALLOWED_WRITE_COMMANDS: Record<string, { confirm?: GitConfirm; rejectFlags?: string[] }> = {
  switch: {},
  branch: { rejectFlags: ["-D", "--delete --force"] },
  merge: { confirm: "merge" },
  rebase: { confirm: "rebase" },
  commit: { rejectFlags: ["--amend"] },
  add: {},
  restore: { rejectFlags: ["--source", "--worktree"] },
  stash: {},
  push: { rejectFlags: ["--force", "-f"] },
  pull: {},
  rm: {},
  mv: {},
};

export function assertGitOp(args: string[]): GitOpAllow {
  const [cmd, ...rest] = args;
  if (!cmd) return { ok: false, error: "git 命令为空" };
  if (cmd === "checkout" || cmd === "reset" || cmd === "clean" || cmd === "revert") {
    return { ok: false, error: `破坏性命令拒绝：${cmd}` };
  }
  const spec = ALLOWED_WRITE_COMMANDS[cmd];
  if (!spec) return { ok: false, error: `命令不在写白名单：${cmd}` };
  if (spec.rejectFlags) {
    for (const flag of spec.rejectFlags) {
      if (rest.includes(flag) || rest.some((a) => a === flag)) {
        return { ok: false, error: `标志拒绝：${cmd} ${flag}` };
      }
    }
  }
  // 自由参数合法性：分支名/路径（非 - 开头）；- 开头参数必须非危险（白名单外 - 参数拒绝）
  for (const arg of rest) {
    if (arg.startsWith("-")) {
      if (cmd === "branch" && (arg === "-d" || arg === "-c" || arg === "-a" || arg === "-r" || arg === "-v" || arg === "--show-current" || arg === "--no-color")) continue;
      if (cmd === "switch" && arg === "-c") continue;
      if (cmd === "restore" && arg === "--staged") continue;
      if (cmd === "push" && (arg === "-u" || arg === "--set-upstream")) continue;
      if (cmd === "stash" && (arg === "push" || arg === "pop" || arg === "apply" || arg === "drop" || arg === "list" || arg === "show")) continue;
      if (cmd === "commit" && arg === "-m") continue;
      if (cmd === "stash" && arg === "-m") continue;
      return { ok: false, error: `标志不在白名单：${arg}` };
    }
  }
  if (cmd === "branch" && rest.includes("-d")) return { ok: true, confirm: "delete-branch" };
  return { ok: true, confirm: spec.confirm };
}

export type GitOpResult = { ok: true } | { ok: false; error: string };

async function runOp(args: string[], cwd: string, git: GitRunner, confirm?: GitConfirm): Promise<GitOpResult> {
  const allow = assertGitOp(args);
  if (!allow.ok) return { ok: false, error: allow.error };
  if (confirm && allow.confirm !== confirm) return { ok: false, error: `需要确认：${allow.confirm}` };
  const r = await git(args);
  if (r.code !== 0) return { ok: false, error: r.stderr.trim() || `git ${args[0]} 失败（code ${r.code}）` };
  return { ok: true };
}

/** 分支列表（当前分支 + 名称列表） */
export async function listBranches(cwd: string, git: GitRunner): Promise<{ current: string | null; branches: string[] }> {
  const r = await git(["branch", "--no-color"]);
  const branches: string[] = [];
  let current: string | null = null;
  for (const line of r.stdout.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    const name = trimmed.replace(/^\*/, "").trim();
    if (line.startsWith("*")) current = name;
    branches.push(name);
  }
  return { current, branches };
}

export async function switchBranch(cwd: string, branch: string, git: GitRunner): Promise<GitOpResult> {
  return runOp(["switch", branch], cwd, git);
}

export async function createBranch(cwd: string, name: string, git: GitRunner): Promise<GitOpResult> {
  return runOp(["branch", name], cwd, git);
}

export async function deleteBranch(cwd: string, branch: string, git: GitRunner): Promise<GitOpResult> {
  return runOp(["branch", "-d", branch], cwd, git, "delete-branch");
}

export async function mergeBranch(cwd: string, branch: string, git: GitRunner): Promise<GitOpResult> {
  return runOp(["merge", branch], cwd, git, "merge");
}

export async function rebaseBranch(cwd: string, branch: string, git: GitRunner): Promise<GitOpResult> {
  return runOp(["rebase", branch], cwd, git, "rebase");
}

/** 暂存文件（git add；白名单内） */
export async function stageFiles(cwd: string, paths: string[], git: GitRunner): Promise<GitOpResult> {
  return runOp(["add", ...paths], cwd, git);
}

/** 取消暂存（git restore --staged；白名单内） */
export async function unstageFiles(cwd: string, paths: string[], git: GitRunner): Promise<GitOpResult> {
  return runOp(["restore", "--staged", ...paths], cwd, git);
}

/** 提交（git commit -m；空消息拒绝） */
export async function commitChanges(cwd: string, message: string, git: GitRunner): Promise<GitOpResult> {
  if (message.trim() === "") return { ok: false, error: "commit message 不能为空" };
  return runOp(["commit", "-m", message], cwd, git);
}

/** 推送当前分支（git push；--force 已被白名单拒绝） */
export async function pushBranch(cwd: string, git: GitRunner): Promise<GitOpResult> {
  return runOp(["push"], cwd, git);
}

/** 拉取（git pull） */
export async function pullBranch(cwd: string, git: GitRunner): Promise<GitOpResult> {
  return runOp(["pull"], cwd, git);
}

export type StashAction = "push" | "pop" | "apply" | "drop";

/** stash 操作（push 可带 message；其余无参） */
export async function stashOp(cwd: string, action: StashAction, message: string | undefined, git: GitRunner): Promise<GitOpResult> {
  const args = action === "push" ? ["stash", "push", ...(message ? ["-m", message] : [])] : ["stash", action];
  return runOp(args, cwd, git);
}

/** 发现 cwd 下的全部 git 仓库（深度 ≤4；跳过 node_modules/隐藏目录；嵌套独立；cwd 自身优先） */
export async function discoverRepos(cwd: string, fs: FsLike, maxDepth = 4): Promise<string[]> {
  const repos: string[] = [];
  const walk = async (dir: string, depth: number): Promise<void> => {
    let names: string[];
    try {
      names = await fs.readdir(dir);
    } catch {
      return;
    }
    if (names.includes(".git")) {
      repos.push(dir);
      // 嵌套 repo 独立——继续下钻（.git 本身不进入子扫描）
    }
    if (depth >= maxDepth) return;
    for (const name of names) {
      if (name === ".git" || name === "node_modules" || name.startsWith(".")) continue;
      let st;
      try {
        st = await fs.stat(join(dir, name));
      } catch {
        continue;
      }
      if (st.isDirectory()) await walk(join(dir, name), depth + 1);
    }
  };
  await walk(cwd, 0);
  return repos.sort((a, b) => {
    if (a === cwd) return -1;
    if (b === cwd) return 1;
    return a.localeCompare(b);
  });
}

/** repo brief：分支 + ahead/behind（git status -sb 第一行解析） */
export async function repoBrief(
  root: string,
  git: GitRunner,
): Promise<{ branch: string | null; ahead: number; behind: number }> {
  const [b, s] = await Promise.all([
    git(["branch", "--show-current"]),
    git(["status", "-sb"]),
  ]);
  const branch = b.stdout.trim() || null;
  const head = s.stdout.split("\n")[0] ?? "";
  const m = head.match(/\[ahead (\d+)(?:, behind (\d+))?\]|\[behind (\d+)\]/);
  let ahead = 0;
  let behind = 0;
  if (m) {
    ahead = Number(m[1] ?? 0);
    behind = Number(m[2] ?? m[3] ?? 0);
  }
  return { branch, ahead, behind };
}

/** repoRoot 白名单：cwd 内（含 cwd 自身）且存在 .git——等价于发现列表 */
export async function assertRepoRoot(
  cwd: string,
  repoRoot: string | undefined,
  fs: FsLike,
): Promise<{ ok: true; root: string } | { ok: false; error: string }> {
  const rel = repoRoot ?? "";
  const abs = resolveWithinRoot(cwd, rel);
  if (!abs) return { ok: false, error: "repoRoot 越权" };
  try {
    const names = await fs.readdir(abs);
    if (!names.includes(".git")) return { ok: false, error: `不是 git 仓库：${rel || "(cwd)"}` };
  } catch {
    return { ok: false, error: `repoRoot 不存在：${rel || "(cwd)"}` };
  }
  return { ok: true, root: abs };
}
