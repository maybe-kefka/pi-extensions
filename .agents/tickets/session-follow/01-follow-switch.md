# 01 — follow-switch

**What to build:** TUI 切换会话后 web 完整跟随：`session_switch_ready` 到达时前端自动刷新会话列表（高亮/会话名跟随）并重新拉取当前会话历史（消息区显示新会话内容，不再是空等待）。

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] 前端收到 `session_switch_ready` → 自动 `refreshSessions()`（列表高亮/会话名跟随）
- [ ] 前端收到 `session_switch_ready` → 重新请求 `pi:getMessages` 并渲染历史（切到旧会话可见其完整历史）
- [ ] 流式场景不受影响（切换后新消息照常流式追加）
- [ ] `npm test` + `npm run typecheck` 全绿
- [ ] 冒烟：rpc 通道 `/resume` 模拟切换 → 列表出现两会话且高亮跟随、消息区显示新会话历史
