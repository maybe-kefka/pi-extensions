# 07 — 行为清理

**What to build:** R26 session-follow 移除（session_switch_ready 不再自动切 tab/loadHistory——宿主 tab 跟随进程 session）；files view 删除（FILES_VIEW_ID/空态 hint/活动栏自动激活）；发送直发本 tab 实例（无需切换）。

**Blocked by:** 05 — chat tab 状态机

**Status:** ready-for-agent

- [ ] session_switch_ready 处理移除（不切 tab 不 loadHistory；宿主 tab 内容由进程 session 事件驱动）
- [ ] files view 删除（无"从侧边栏选择文件"空态；活动栏点击只切侧边栏）
- [ ] 发送路由：各 tab 发送走自己实例（无需 session 切换）
- [ ] npm test + typecheck 全绿 + 冒烟
