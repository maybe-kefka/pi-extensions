# 05c — git 控制面板：push/pull + stash + merge/rebase

**What to build:** 面板补全远程与暂存操作：push / pull 按钮（成功/失败 toast，git 错误原样展示）；stash 区（push 全部改动（可带 message）/ pop / apply / drop）；merge/rebase 确认弹窗（展示目标分支）已接入 05a 分支行操作，此处补全其失败反馈与状态刷新。服务端白名单扩展 stash/push/pull（restore --staged 已含）；新增 `pi:gitPush`/`pi:gitPull`/`pi:gitStash`。

**Blocked by:** 05b — git 控制面板：staging + commit

**Status:** ready-for-agent

- [ ] push/pull 真实执行（成功 toast / 失败展示 git 错误如认证/非 fast-forward）；stash push/pop/apply/drop 往返真实生效（git stash list 验证）
- [ ] merge/rebase 确认弹窗 → 执行 → 结果反馈与状态刷新
- [ ] 白名单/编排单测（stash/push/pull）；GitPanel 组件测试（按钮/反馈）
- [ ] `npm test` + `npm run typecheck` 全绿；浏览器冒烟：stash 往返 + push/pull 反馈 + merge 确认

