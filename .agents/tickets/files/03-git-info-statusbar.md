# 03 — git 状态条（repo 识别 + worktree 标记）

**What to build:** 文件页头部状态条：非 git 目录显示"非 git 仓库"；git 仓库显示 repo 根、当前分支、linked worktree 标记（`git rev-parse --git-dir` 与 `--git-common-dir` 不同即 worktree）。服务端新增 git 域（只读白名单校验 `assertReadOnlyGit`：diff/status/log/show/rev-parse/branch，拒绝一切破坏性命令；repoInfo 组装）+ `pi:gitInfo` RPC；git 执行走现有 execCommand（shell:false）。所有 git 调用先过白名单。

**Blocked by:** 01 — 文件浏览（目录树 + 只读打开）

**Status:** ready-for-agent

- [ ] 状态条正确显示三态：非仓库 / 仓库+分支 / 仓库+分支+worktree 标记
- [ ] 白名单外 git 命令（checkout/reset/commit/add 等）在服务端被拒绝，返回结构化错误
- [ ] git 域单测：白名单矩阵（允许/拒绝典型命令组）、repoInfo 真假两态与 worktree 判定（假 runner）
- [ ] `npm test` + `npm run typecheck` 全绿；浏览器冒烟：真实仓库 + 真实 linked worktree 子目录下状态条正确

