import { describe, expect, it } from "vitest";
import { aggregateStatus, assertReadOnlyGit, fileDiff, parseGitDiff, parsePorcelain, repoInfo, type GitRunner } from "./git.js";

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
