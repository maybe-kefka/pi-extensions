# 06 — usage 上报 + 水杯进度条

**What to build:** 协议新增 `usage_update` 事件（注册者上报 context usage：事件触发 + 周期兜底）；TUI/spawn 注册者上报；chat input 左侧垂直水杯进度条（~10px×~64px 圆角、水位从底往上、分级变色 <60% 绿 / 60-85% 黄 / >85% 红、点击打开 ContextPanel 详情），数据 = 对应 tab 实例的 usage；Header 右上全局进度条移除。

**Blocked by:** 02（TUI 注册者接入）、03（spawn 会话实例）

**Status:** ready-for-agent

- [ ] 协议 `usage_update` 事件（解析/转发单测）；注册者（TUI/spawn）上报实现
- [ ] usage-tier 纯函数（percent → 颜色/水位分级边界单测）
- [ ] 水杯组件（chat tab input 左侧、点击 → ContextPanel）
- [ ] Header 进度条移除（全局条不再显示）
- [ ] npm test + typecheck 全绿；冒烟：流式时水位增长 + 分级变色 + 点击详情 ✓
