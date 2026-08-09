# 02 — theme-panel

**What to build:** 侧边栏「外观」面板与联动修复。侧边栏「模型 / 思考」面板下方新增「外观」面板：主题 Select（跟随系统 + 5 主题）与深浅三态 Select（跟随系统 / 浅色 / 深色）；选择即时生效并持久化。代码高亮（hljs）与 toast（sonner）配色随当前主题/深浅联动，不再硬编码暗色。用户可随时恢复「跟随系统」。

**Blocked by:** 01 — theme-engine

**Status:** ready-for-agent

- [ ] 「外观」面板渲染在侧边栏「模型 / 思考」下方（主题 Select 5 项 + 深浅三态 Select 3 项）
- [ ] 选择主题/深浅 → 立即应用（data-theme/.dark 更新）+ localStorage 持久化；「跟随系统」恢复默认行为
- [ ] sonner Toaster theme 跟随当前 scheme（去硬编码 dark）
- [ ] hljs 代码高亮配色随主题（去硬编码 github-dark.css 导入）
- [ ] 刷新后选择保持；切换不丢会话
- [ ] `npm test` + `npm run typecheck` 全绿 + 浏览器冒烟

## Blocked by

01 — theme-engine
