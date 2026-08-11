# 05 — 分支数据底座（本地+远程解析 / 切换与创建编排 / RPC）

**What to build:** 分支数据源扩展：listBranches 解析 `git branch -a` 输出，返回本地分支与远程分支（origin/foo 全名）分组；新增 switchOrTrack 编排（点远程：本地同名存在 → switch 短名，否则 switch -c 短名 --track 远程）、createBranch 编排（switch -c name base，base 可本地或远程）；switch 白名单放行 --track；`pi:gitBranches` 返回增加 remotes 字段、新增 `pi:gitCreateBranch {name, base, repoRoot}` RPC。

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] listBranches：本地/远程分组解析（当前分支标记、remotes/origin/ 前缀剥离为 origin/foo）
- [ ] switchOrTrack 两分支 argv 正确（短名存在 → switch / 不存在 → switch -c --track）
- [ ] createBranch argv 正确（switch -c name base）；assertGitOp 放行 `switch -c x --track origin/main`、其他未知标志仍拒绝
- [ ] pi:gitBranches 返回 remotes；pi:gitCreateBranch 经 assertGitOp 校验 name/base 后执行
- [ ] git 域单测全绿 + npm test + typecheck 全绿
