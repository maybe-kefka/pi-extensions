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
