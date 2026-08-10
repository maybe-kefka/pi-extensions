# 05a — git 控制面板：分支管理

**What to build:** git 面板骨架 + 分支区：本地分支列表（当前分支高亮 + 状态条联动），点击行切换分支（直接执行，失败 toast 展示 git 错误）；行 hover 操作：新建分支（输入名）、合并到当前（确认弹窗）、rebase 到当前（确认弹窗）、删除分支（确认弹窗，当前分支禁用）；破坏性命令白名单拒绝（reset --hard/clean/force push）。服务端 git 域白名单扩展为"只读 + 受限写"（switch/branch -c/-d(confirm)/merge(confirm)/rebase(confirm)），新增 `pi:gitBranches`/`pi:gitSwitch`/`pi:gitBranchCreate`/`pi:gitBranchDelete`/`pi:gitMerge`/`pi:gitRebase`。

**Blocked by:** 03 — activity bar 布局重构（四面板 + 聊天全宽）

**Status:** ready-for-agent

- [ ] 分支列表/当前高亮/切换成功与冲突报错（toast 展示 git 错误）；新建/删除/合并/rebase 全流程（确认弹窗生效）
- [ ] 白名单矩阵单测（放行/拒绝/confirm 标记）；操作编排单测（假 runner）；GitPanel 分支区组件测试
- [ ] `npm test` + `npm run typecheck` 全绿；浏览器冒烟：真实仓库建分支→切换→合并→删除（git 命令验证）

