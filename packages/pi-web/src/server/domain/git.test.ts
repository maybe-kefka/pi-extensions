import { describe, expect, it } from "vitest";
import type { FsLike } from "./files.js";
import {
  aggregateStatus,
  assertGitOp,
  assertReadOnlyGit,
  assertRepoRoot,
  discoverRepos,
  deleteBranch,
  fileDiff,
  createBranchFrom,
  listBranches,
  mergeBranch,
  commitChanges,
  parseGitDiff,
  parsePorcelain,
  pullBranch,
  repoBrief,
  pushBranch,
  showHeadFile,
  repoInfo,
  stageFiles,
  stashOp,
  switchBranch,
  switchOrTrack,
  unstageFiles,
  type GitRunner,
} from "./git.js";

describe("assertReadOnlyGit 白名单", () => {
  it("允许只读查询命令", () => {
    expect(assertReadOnlyGit(["diff"])).toEqual({ ok: true });
    expect(assertReadOnlyGit(["status", "--short"])).toEqual({ ok: true });
    expect(assertReadOnlyGit(["log", "--oneline", "--max-count=10"])).toEqual({ ok: true });
    expect(assertReadOnlyGit(["show", "--stat"])).toEqual({ ok: true });
    expect(assertReadOnlyGit(["rev-parse", "--is-inside-work-tree"])).toEqual({ ok: true });
    expect(assertReadOnlyGit(["branch", "--show-current"])).toEqual({ ok: true });
  });

  it("diff 允许 --cached 与路径", () => {
    expect(assertReadOnlyGit(["diff", "--cached"])).toEqual({ ok: true });
    expect(assertReadOnlyGit(["diff", "HEAD", "--", "src/a.ts"])).toEqual({ ok: true });
    expect(assertReadOnlyGit(["diff", "--stat"])).toEqual({ ok: true });
    expect(assertReadOnlyGit(["diff", "--unified=3"])).toEqual({ ok: true });
  });

  it("拒绝破坏性命令", () => {
    for (const args of [
      ["checkout", "main"],
      ["reset", "--hard"],
      ["commit", "-m", "x"],
      ["add", "a.ts"],
      ["restore", "a.ts"],
      ["stash", "pop"],
      ["clean", "-fd"],
      ["rm", "a.ts"],
      ["branch", "-d", "feature"],
      ["switch", "main"],
      ["push"],
      ["pull"],
      ["merge"],
    ]) {
      expect(assertReadOnlyGit(args), args.join(" ")).toEqual({ ok: false, error: expect.any(String) });
    }
  });

  it("拒绝 --output 类写文件标志", () => {
    expect(assertReadOnlyGit(["diff", "--output=/tmp/x"])).toEqual({ ok: false, error: expect.any(String) });
    expect(assertReadOnlyGit(["log", "--output=/tmp/x"])).toEqual({ ok: false, error: expect.any(String) });
    expect(assertReadOnlyGit(["show", "--output-indicator-new=+", "--output=/tmp/x"])).toEqual({ ok: false, error: expect.any(String) });
  });

  it("拒绝未知 - 选项（保守）", () => {
    expect(assertReadOnlyGit(["diff", "--evil"])).toEqual({ ok: false, error: expect.any(String) });
    expect(assertReadOnlyGit(["status", "--whatever"])).toEqual({ ok: false, error: expect.any(String) });
  });

  it("拒绝自由参数（非 -- 路径段）", () => {
    expect(assertReadOnlyGit(["log", "abc1234"])).toEqual({ ok: false, error: expect.any(String) });
    expect(assertReadOnlyGit(["show", "HEAD"])).toEqual({ ok: false, error: expect.any(String) });
    expect(assertReadOnlyGit(["rev-parse", "HEAD"])).toEqual({ ok: false, error: expect.any(String) });
  });

  it("允许 -- 之后的路径段（含 - 开头路径需 -- 分隔）", () => {
    expect(assertReadOnlyGit(["diff", "--", "-weird-file"])).toEqual({ ok: true });
  });

  it("rev-parse 仅允许预设查询标志", () => {
    expect(assertReadOnlyGit(["rev-parse", "--show-toplevel"])).toEqual({ ok: true });
    expect(assertReadOnlyGit(["rev-parse", "--git-dir"])).toEqual({ ok: true });
    expect(assertReadOnlyGit(["rev-parse", "--git-common-dir"])).toEqual({ ok: true });
    expect(assertReadOnlyGit(["rev-parse", "--abbrev-ref", "HEAD"])).toEqual({ ok: false, error: expect.any(String) });
    expect(assertReadOnlyGit(["rev-parse", "--git-path", "hooks"])).toEqual({ ok: false, error: expect.any(String) });
  });
});

describe("parseGitDiff", () => {
  it("解析 hunk 头与增删上下文行", () => {
    const text = [
      "diff --git a/a.ts b/a.ts",
      "index abc..def 100644",
      "--- a/a.ts",
      "+++ b/a.ts",
      "@@ -1,3 +1,4 @@",
      " const a = 1;",
      "-const b = 2;",
      "+const b = 3;",
      "+const c = 4;",
      " const d = 5;",
    ].join("\n");
    const hunks = parseGitDiff(text);
    expect(hunks).toHaveLength(1);
    expect(hunks[0].header).toBe("@@ -1,3 +1,4 @@");
    expect(hunks[0].lines.map((l) => `${l.type}:${l.text}`)).toEqual([
      "ctx: const a = 1;",
      "del:const b = 2;",
      "add:const b = 3;",
      "add:const c = 4;",
      "ctx: const d = 5;",
    ]);
  });

  it("多个 hunk 分段", () => {
    const text = "@@ -1 +1 @@\n+a\n@@ -5 +6 @@\n-b\n";
    const hunks = parseGitDiff(text);
    expect(hunks).toHaveLength(2);
    expect(hunks[1].lines).toEqual([{ type: "del", text: "b" }]);
  });

  it("\\ No newline at end of file 标记并入前一行（不产生新行）", () => {
    const text = "@@ -1,2 +1,2 @@\n-a\n\\ No newline at end of file\n+b\n";
    const hunks = parseGitDiff(text);
    expect(hunks[0].lines).toEqual([
      { type: "del", text: "a" },
      { type: "add", text: "b" },
    ]);
  });

  it("空文本返回空数组；非 hunk 前缀行忽略", () => {
    expect(parseGitDiff("")).toEqual([]);
    expect(parseGitDiff("diff --git a/x b/x\n--- a/x\n+++ b/x\n")).toEqual([]);
  });

  it("新文件（无上下文行）解析", () => {
    const text = "@@ -0,0 +1,2 @@\n+line1\n+line2\n";
    const hunks = parseGitDiff(text);
    expect(hunks[0].lines.map((l) => l.type)).toEqual(["add", "add"]);
  });
});

describe("repoInfo", () => {
  const runner = (responses: Record<string, string>): GitRunner => {
    return async (args) => {
      const key = args.join(" ");
      if (responses[key] === "!!") return { code: 1, stdout: "", stderr: "not a git repo" };
      return { code: 0, stdout: responses[key] ?? "", stderr: "" };
    };
  };

  it("非 git 目录 → isRepo:false", async () => {
    const git = runner({ "rev-parse --is-inside-work-tree": "!!" });
    expect(await repoInfo("/x", git)).toEqual({ isRepo: false });
  });

  it("普通仓库 → repoRoot + branch + worktree:false", async () => {
    const git = runner({
      "rev-parse --is-inside-work-tree": "true\n",
      "rev-parse --show-toplevel": "/repo\n",
      "rev-parse --abbrev-ref HEAD": "main\n",
      "rev-parse --git-dir": "/repo/.git\n",
      "rev-parse --git-common-dir": "/repo/.git\n",
    });
    expect(await repoInfo("/repo/sub", git)).toEqual({ isRepo: true, repoRoot: "/repo", branch: "main", worktree: false });
  });

  it("linked worktree → worktree:true（git-dir 与 common-dir 不同）", async () => {
    const git = runner({
      "rev-parse --is-inside-work-tree": "true\n",
      "rev-parse --show-toplevel": "/wt/feat\n",
      "rev-parse --abbrev-ref HEAD": "feat\n",
      "rev-parse --git-dir": "/wt/feat/.git\n",
      "rev-parse --git-common-dir": "/repo/.git\n",
    });
    expect(await repoInfo("/wt/feat", git)).toEqual({ isRepo: true, repoRoot: "/wt/feat", branch: "feat", worktree: true });
  });

  it("detached HEAD → branch 返回 HEAD", async () => {
    const git = runner({
      "rev-parse --is-inside-work-tree": "true\n",
      "rev-parse --show-toplevel": "/repo\n",
      "rev-parse --abbrev-ref HEAD": "HEAD\n",
      "rev-parse --git-dir": "/repo/.git\n",
      "rev-parse --git-common-dir": "/repo/.git\n",
    });
    const info = await repoInfo("/repo", git);
    expect(info.isRepo && info.branch).toBe("HEAD");
  });
});

describe("fileDiff", () => {
  const runner = (responses: Record<string, { code: number; stdout: string }>): GitRunner => {
    return async (args) => {
      const key = args.join(" ");
      const r = responses[key] ?? { code: 1, stdout: "" };
      return { code: r.code, stdout: r.stdout, stderr: "" };
    };
  };

  it("非 git 目录 → isRepo:false", async () => {
    const git = runner({ "rev-parse --is-inside-work-tree": { code: 1, stdout: "" } });
    expect(await fileDiff("/x", "a.ts", git)).toEqual({ isRepo: false });
  });

  it("无改动 → diff:null", async () => {
    const git = runner({
      "rev-parse --is-inside-work-tree": { code: 0, stdout: "true\n" },
      "diff HEAD -- a.ts": { code: 0, stdout: "" },
    });
    expect(await fileDiff("/repo", "a.ts", git)).toEqual({ isRepo: true, diff: null });
  });

  it("有改动 → 解析 hunk", async () => {
    const git = runner({
      "rev-parse --is-inside-work-tree": { code: 0, stdout: "true\n" },
      "diff HEAD -- a.ts": { code: 0, stdout: "@@ -1 +1 @@\n-old\n+new\n" },
    });
    const r = await fileDiff("/repo", "a.ts", git);
    expect(r.isRepo).toBe(true);
    if (r.isRepo) {
      expect(r.diff?.[0].lines).toEqual([
        { type: "del", text: "old" },
        { type: "add", text: "new" },
      ]);
    }
  });

  it("含危险路径（../）→ 白名单拒绝 → diff:null", async () => {
    const git = runner({ "rev-parse --is-inside-work-tree": { code: 0, stdout: "true\n" } });
    const r = await fileDiff("/repo", "../etc/passwd", git);
    expect(r.isRepo).toBe(true);
    if (r.isRepo) expect(r.diff).toBeNull();
  });
});

describe("parsePorcelain", () => {
  it("解析 XY 双列状态（staged/工作区分开）", () => {
    const out = [
      " M src/a.ts",       // 工作区修改
      "M  src/b.ts",       // 已暂存修改
      "MM src/c.ts",       // 暂存 + 工作区都改
      "?? new-file.ts",    // 未跟踪
      " D deleted.ts",     // 工作区删除
      "D  staged-del.ts",  // 暂存删除
      "R  old.ts -> new.ts", // 重命名
    ].join("\n");
    const entries = parsePorcelain(out);
    expect(entries).toEqual([
      { path: "src/a.ts", status: "M", staged: false },
      { path: "src/b.ts", status: "M", staged: true },
      { path: "src/c.ts", status: "M", staged: true },
      { path: "new-file.ts", status: "??", staged: false },
      { path: "deleted.ts", status: "D", staged: false },
      { path: "staged-del.ts", status: "D", staged: true },
      { path: "new.ts", status: "R", staged: true },
    ]);
  });

  it("空输出返回空数组；非 git 目录（fatal）返回空", () => {
    expect(parsePorcelain("")).toEqual([]);
    expect(parsePorcelain("fatal: not a git repository")).toEqual([]);
  });
});

describe("aggregateStatus", () => {
  it("目录聚合：父目录含改动则标记（不存在的父目录也聚合）", () => {
    const map = aggregateStatus([
      { path: "src/a.ts", status: "M", staged: false },
      { path: "src/deep/b.ts", status: "??", staged: false },
      { path: "README.md", status: "M", staged: false },
    ]);
    expect(map.get("src/a.ts")).toBe("M");
    expect(map.get("src")).toBe("M");
    expect(map.get("src/deep")).toBe("??");
    expect(map.get("src/deep/b.ts")).toBe("??");
    expect(map.get("README.md")).toBe("M");
    expect(map.get("other.ts")).toBeUndefined();
  });

  it("目录内均为未跟踪时父目录也标 ??（聚合取子级状态）", () => {
    const map = aggregateStatus([{ path: "new/a.ts", status: "??", staged: false }]);
    expect(map.get("new")).toBe("??");
  });
});

describe("assertGitOp（写操作白名单）", () => {
  it("switch 放行 -c + --track（远程跟踪创建）", () => {
    expect(assertGitOp(["switch", "-c", "foo", "--track", "origin/foo"])).toEqual({ ok: true });
    expect(assertGitOp(["switch", "--force"])).toEqual({ ok: false, error: expect.stringContaining("不在白名单") });
  });

  it("分支操作放行（merge/rebase/delete 带 confirm 标记）", () => {
    expect(assertGitOp(["switch", "main"])).toEqual({ ok: true });
    expect(assertGitOp(["switch", "-c", "feat"])).toEqual({ ok: true });
    expect(assertGitOp(["branch", "feat"])).toEqual({ ok: true });
    expect(assertGitOp(["branch", "-d", "feat"])).toEqual({ ok: true, confirm: "delete-branch" });
    expect(assertGitOp(["merge", "feat"])).toEqual({ ok: true, confirm: "merge" });
    expect(assertGitOp(["rebase", "feat"])).toEqual({ ok: true, confirm: "rebase" });
  });

  it("破坏性命令拒绝", () => {
    expect(assertGitOp(["reset", "--hard"])).toEqual({ ok: false, error: expect.any(String) });
    expect(assertGitOp(["clean", "-fd"])).toEqual({ ok: false, error: expect.any(String) });
    expect(assertGitOp(["push", "--force"])).toEqual({ ok: false, error: expect.any(String) });
    expect(assertGitOp(["push", "-f"])).toEqual({ ok: false, error: expect.any(String) });
    expect(assertGitOp(["branch", "-D", "feat"])).toEqual({ ok: false, error: expect.any(String) });
    expect(assertGitOp(["checkout", "main"])).toEqual({ ok: false, error: expect.any(String) });
    expect(assertGitOp(["commit", "--amend"])).toEqual({ ok: false, error: expect.any(String) });
  });
});

describe("分支操作编排", () => {
  const runner = (responses: Record<string, { code: number; stdout?: string; stderr?: string }>) => {
    return (async (args: string[]) => {
      const r = responses[args.join(" ")] ?? { code: 0, stdout: "" };
      return { code: r.code, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
    }) as GitRunner;
  };

  it("listBranches 解析本地/远程分组（branch -a 输出）", async () => {
    const git = runner({
      "branch -a --no-color": {
        code: 0,
        stdout: "* main\n  feat\n  fix/1\n  remotes/origin/HEAD -> origin/main\n  remotes/origin/main\n  remotes/origin/feat\n",
      },
    });
    expect(await listBranches("/repo", git)).toEqual({
      current: "main",
      branches: ["main", "feat", "fix/1"],
      remotes: ["origin/main", "origin/feat"],
    });
  });

  it("detached HEAD：branch 输出无 * 行", async () => {
    const git = runner({ "branch -a --no-color": { code: 0, stdout: "  main\n  remotes/origin/main\n" } });
    expect(await listBranches("/repo", git)).toEqual({ current: null, branches: ["main"], remotes: ["origin/main"] });
  });

  it("switchOrTrack：本地短名存在 → 直接 switch", async () => {
    const calls: string[][] = [];
    const git = (async (args: string[]) => {
      calls.push(args);
      return { code: 0, stdout: "  foo\n", stderr: "" };
    }) as GitRunner;
    expect(await switchOrTrack("/repo", "origin/foo", git)).toEqual({ ok: true });
    expect(calls).toEqual([["branch", "-a", "--no-color"], ["switch", "foo"]]);
  });

  it("switchOrTrack：本地无短名 → switch -c short --track remote", async () => {
    const calls: string[][] = [];
    const git = (async (args: string[]) => {
      calls.push(args);
      return { code: 0, stdout: "  main\n", stderr: "" };
    }) as GitRunner;
    expect(await switchOrTrack("/repo", "origin/foo", git)).toEqual({ ok: true });
    expect(calls).toEqual([["branch", "-a", "--no-color"], ["switch", "-c", "foo", "--track", "origin/foo"]]);
  });

  it("createBranchFrom：switch -c name base（base 本地或远程）", async () => {
    const calls: string[][] = [];
    const git = (async (args: string[]) => {
      calls.push(args);
      return { code: 0, stdout: "", stderr: "" };
    }) as GitRunner;
    expect(await createBranchFrom("/repo", "new", "origin/main", git)).toEqual({ ok: true });
    expect(calls).toEqual([["switch", "-c", "new", "origin/main"]]);
  });

  it("switchBranch 成功/失败（stderr 透传）", async () => {
    const ok = runner({ "switch feat": { code: 0 } });
    expect(await switchBranch("/repo", "feat", ok)).toEqual({ ok: true });
    const err = runner({ "switch feat": { code: 1, stderr: "error: pathspec 'feat' did not match" } });
    expect(await switchBranch("/repo", "feat", err)).toEqual({ ok: false, error: expect.stringContaining("did not match") });
  });

  it("deleteBranch 当前分支被 git 拒绝（stderr 透传）", async () => {
    const git = runner({ "branch -d main": { code: 1, stderr: "error: Cannot delete branch 'main' checked out" } });
    expect(await deleteBranch("/repo", "main", git)).toEqual({ ok: false, error: expect.stringContaining("Cannot delete") });
  });

  it("merge/rebase 失败透传 stderr", async () => {
    const git = runner({ "merge feat": { code: 1, stderr: "CONFLICT (content)" } });
    expect(await mergeBranch("/repo", "feat", git)).toEqual({ ok: false, error: expect.stringContaining("CONFLICT") });
  });
});

describe("staging / commit 编排", () => {
  const runner = (responses: Record<string, { code: number; stderr?: string }>) => {
    return (async (args: string[]) => {
      const r = responses[args.join(" ")] ?? { code: 0 };
      return { code: r.code, stdout: "", stderr: r.stderr ?? "" };
    }) as GitRunner;
  };

  it("stageFiles 调 git add（多路径）", async () => {
    const calls: string[][] = [];
    const git = (async (args: string[]) => {
      calls.push(args);
      return { code: 0, stdout: "", stderr: "" };
    }) as GitRunner;
    expect(await stageFiles("/repo", ["a.ts", "b.ts"], git)).toEqual({ ok: true });
    expect(calls).toEqual([["add", "a.ts", "b.ts"]]);
  });

  it("unstageFiles 调 git restore --staged", async () => {
    const calls: string[][] = [];
    const git = (async (args: string[]) => {
      calls.push(args);
      return { code: 0, stdout: "", stderr: "" };
    }) as GitRunner;
    expect(await unstageFiles("/repo", ["a.ts"], git)).toEqual({ ok: true });
    expect(calls).toEqual([["restore", "--staged", "a.ts"]]);
  });

  it("commitChanges 调 git commit -m；空消息拒绝", async () => {
    const calls: string[][] = [];
    const git = (async (args: string[]) => {
      calls.push(args);
      return { code: 0, stdout: "", stderr: "" };
    }) as GitRunner;
    expect(await commitChanges("/repo", "", git)).toEqual({ ok: false, error: expect.any(String) });
    expect(await commitChanges("/repo", "feat: x", git)).toEqual({ ok: true });
    expect(calls).toEqual([["commit", "-m", "feat: x"]]);
  });

  it("commit 失败（无用户配置等）stderr 透传", async () => {
    const git = runner({
      "commit -m msg": { code: 128, stderr: "Author identity unknown" },
    });
    expect(await commitChanges("/repo", "msg", git)).toEqual({ ok: false, error: expect.stringContaining("Author identity") });
  });
});

describe("push/pull/stash 编排", () => {
  it("pushBranch 调 git push；失败 stderr 透传", async () => {
    const calls: string[][] = [];
    const ok = (async (args: string[]) => {
      calls.push(args);
      return { code: 0, stdout: "", stderr: "" };
    }) as GitRunner;
    expect(await pushBranch("/repo", ok)).toEqual({ ok: true });
    expect(calls).toEqual([["push"]]);
    const err = (async () => ({ code: 1, stdout: "", stderr: "fatal: could not read Username" })) as GitRunner;
    expect(await pushBranch("/repo", err)).toEqual({ ok: false, error: expect.stringContaining("Username") });
  });

  it("pullBranch 调 git pull", async () => {
    const calls: string[][] = [];
    const git = (async (args: string[]) => {
      calls.push(args);
      return { code: 0, stdout: "", stderr: "" };
    }) as GitRunner;
    expect(await pullBranch("/repo", git)).toEqual({ ok: true });
    expect(calls).toEqual([["pull"]]);
  });

  it("stashOp push 带 message；pop/apply/drop", async () => {
    const calls: string[][] = [];
    const git = (async (args: string[]) => {
      calls.push(args);
      return { code: 0, stdout: "", stderr: "" };
    }) as GitRunner;
    expect(await stashOp("/repo", "push", "wip", git)).toEqual({ ok: true });
    expect(await stashOp("/repo", "pop", undefined, git)).toEqual({ ok: true });
    expect(await stashOp("/repo", "apply", undefined, git)).toEqual({ ok: true });
    expect(await stashOp("/repo", "drop", undefined, git)).toEqual({ ok: true });
    expect(calls).toEqual([
      ["stash", "push", "-m", "wip"],
      ["stash", "pop"],
      ["stash", "apply"],
      ["stash", "drop"],
    ]);
  });

  it("stash push 失败（无改动）透传", async () => {
    const git = (async () => ({ code: 1, stdout: "", stderr: "No local changes to save" })) as GitRunner;
    expect(await stashOp("/repo", "push", undefined, git)).toEqual({ ok: false, error: expect.stringContaining("No local changes") });
  });
});

const repoFs = (dirs: string[]): FsLike => {
    const dirSet = new Set(dirs);
    return {
      readdir: async (dir) => {
        const prefix = dir.endsWith("/") ? dir : `${dir}/`;
        const names = new Set<string>();
        for (const d of dirSet) {
          if (!d.startsWith(prefix)) continue;
          const first = d.slice(prefix.length).split("/")[0];
          if (first) names.add(first);
        }
        return [...names];
      },
      stat: async (p) => ({
        isDirectory: () => dirSet.has(p) || [...dirSet].some((d) => d.startsWith(`${p}/`)),
        isFile: () => false,
        isSymbolicLink: () => false,
        size: 0,
        mtimeMs: 0,
      }),
      readFile: async () => Buffer.alloc(0),
      writeFile: async () => {},
      mkdir: async () => {},
      rename: async () => {},
      rm: async () => {},
    };
};

describe("discoverRepos", () => {
  it("cwd 自身 repo + 子目录 repo 均发现（cwd 优先）", async () => {
    const fs = repoFs(["/w", "/w/.git", "/w/a/.git", "/w/a/sub", "/w/b/.git"]);
    expect(await discoverRepos("/w", fs)).toEqual(["/w", "/w/a", "/w/b"]);
  });

  it("无 repo 返回空", async () => {
    const fs = repoFs(["/w", "/w/src"]);
    expect(await discoverRepos("/w", fs)).toEqual([]);
  });

  it("跳过 node_modules 与隐藏目录；深度超限不扫", async () => {
    const fs = repoFs(["/w", "/w/node_modules/x/.git", "/w/.hidden/y/.git", "/w/d1/d2/d3/d4/deep/.git"]);
    expect(await discoverRepos("/w", fs)).toEqual([]);
  });

  it("嵌套 repo（父目录也是 repo）独立列出", async () => {
    const fs = repoFs(["/w", "/w/.git", "/w/packages/app/.git"]);
    expect(await discoverRepos("/w", fs)).toEqual(["/w", "/w/packages/app"]);
  });
});

describe("repoBrief", () => {
  const runner = (branch: string, statusHead: string): GitRunner =>
    (async (args: string[]) => {
      if (args[0] === "branch") return { code: 0, stdout: branch, stderr: "" };
      return { code: 0, stdout: statusHead + "\n M x.ts\n", stderr: "" };
    }) as GitRunner;

  it("ahead + behind 解析", async () => {
    const r = await repoBrief("/w", runner("main\n", "## main...origin/main [ahead 2, behind 1]"));
    expect(r).toEqual({ branch: "main", ahead: 2, behind: 1 });
  });

  it("仅 behind / 无远程", async () => {
    expect(await repoBrief("/w", runner("feat\n", "## feat...origin/feat [behind 3]"))).toEqual({ branch: "feat", ahead: 0, behind: 3 });
    expect(await repoBrief("/w", runner("main\n", "## main"))).toEqual({ branch: "main", ahead: 0, behind: 0 });
  });

  it("无分支（empty repo）branch null", async () => {
    expect(await repoBrief("/w", runner("", "## No commits yet on main"))).toEqual({ branch: null, ahead: 0, behind: 0 });
  });
});

describe("assertRepoRoot", () => {
  const fs = repoFs(["/w", "/w/.git", "/w/a/.git"]);

  it("缺省 = cwd；合法 repoRoot 通过；无 .git 拒绝；越权拒绝", async () => {
    expect(await assertRepoRoot("/w", undefined, fs)).toEqual({ ok: true, root: "/w" });
    expect(await assertRepoRoot("/w", "a", fs)).toEqual({ ok: true, root: "/w/a" });
    const noGit = await assertRepoRoot("/w", "b", fs);
    expect(noGit.ok).toBe(false);
    const denied = await assertRepoRoot("/w", "../x", fs);
    expect(denied.ok).toBe(false);
  });
});

describe("showHeadFile", () => {
  it("成功返回 HEAD 版本内容", async () => {
    const calls: string[][] = [];
    const git = (async (args: string[]) => {
      calls.push(args);
      return { code: 0, stdout: "old content\n", stderr: "" };
    }) as GitRunner;
    expect(await showHeadFile("/w", "a.ts", git)).toEqual({ ok: true, content: "old content\n" });
    expect(calls).toEqual([["show", "HEAD:a.ts"]]);
  });

  it("新文件（无 HEAD 版本）返回错误", async () => {
    const git = (async () => ({ code: 128, stdout: "", stderr: "fatal: path 'new.ts' exists on disk, but not in 'HEAD'" })) as GitRunner;
    const r = await showHeadFile("/w", "new.ts", git);
    expect(r.ok).toBe(false);
  });

  it("越权路径拒绝（不执行 git）", async () => {
    let called = false;
    const git = (async () => {
      called = true;
      return { code: 0, stdout: "", stderr: "" };
    }) as GitRunner;
    expect(await showHeadFile("/w", "../etc/passwd", git)).toEqual({ ok: false, error: expect.any(String) });
    expect(called).toBe(false);
  });
});
