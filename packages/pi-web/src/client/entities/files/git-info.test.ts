import { describe, expect, it } from "vitest";
import { gitStatusLabel } from "./git-info.js";

describe("gitStatusLabel", () => {
  it("未加载显示 …", () => {
    expect(gitStatusLabel(null)).toBe("…");
  });

  it("非仓库", () => {
    expect(gitStatusLabel({ isRepo: false })).toBe("非 git 仓库");
  });

  it("仓库显示分支 + 根", () => {
    expect(gitStatusLabel({ isRepo: true, repoRoot: "/repo", branch: "main" })).toBe("main · /repo");
  });

  it("detached HEAD 显示 HEAD", () => {
    expect(gitStatusLabel({ isRepo: true, repoRoot: "/repo", branch: "HEAD" })).toBe("HEAD · /repo");
  });

  it("linked worktree 追加标记", () => {
    expect(gitStatusLabel({ isRepo: true, repoRoot: "/wt/feat", branch: "feat", worktree: true })).toBe(
      "feat · /wt/feat · worktree",
    );
  });
});
