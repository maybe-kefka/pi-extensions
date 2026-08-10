# 05b — git 控制面板：staging + commit

**What to build:** 改动列表区：工作区/staged 分组展示（基于 porcelain 状态），文件行 hover：stage/unstage（全部 stage 按钮）；点击改动文件打开对应文件 tab（含 diff 视图）；commit 区：message 输入（空禁用）+ commit 按钮，提交成功清空 staged 并刷新（toast）。服务端新增 `pi:gitStage`/`pi:gitUnstage`/`pi:gitCommit`（白名单 add/restore --staged/commit）。

**Blocked by:** 04 — 文件操作 + git 状态标记（porcelain 复用）、05a — git 分支管理（面板骨架）

**Status:** ready-for-agent

- [ ] 改动列表分组正确（M/A/D/?? 与 staged/工作区）；文件级/全部 stage/unstage 真实生效
- [ ] commit 空 message 禁用；提交后 staged 清空 + 列表刷新（git log 验证）
- [ ] 点击改动文件打开 tab（含 diff）；staging/commit 单测（编排 + 组件）
- [ ] `npm test` + `npm run typecheck` 全绿；浏览器冒烟：改文件→stage→commit 全链路

