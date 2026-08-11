# 05 — chat tab 状态机（processId 维度）

**What to build:** tabs.ts chat tab 改为 processId 维度（`chat:<processId>`，每实例一 tab）；客户端事件按 processId 分发（per-tab 状态 map，现有 stream reducer 实例化）；默认 tab = 宿主进程；宿主 tab 常驻不可关；TUI 切 session → 宿主 tab 内容跟随（不切激活）。

**Blocked by:** 03 — 注册协议；04 — 会话历史读取

**Status:** ready-for-agent

- [ ] tabs.ts：chat tab 带 processId；open/close/activate 语义（宿主常驻）；默认 initial = 宿主 tab
- [ ] 事件分发：服务端广播事件带 processId → 客户端路由到对应 tab 状态
- [ ] per-tab 状态 map 渲染（多 chat tab 并存，各显各的流/历史）
- [ ] 状态机单测全绿；npm test + typecheck 全绿
