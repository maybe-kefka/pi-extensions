# 03 — 注册协议（服务端核心）

**What to build:** 同 cwd 多 pi 实例共享 web 服务：`.pi/web.json` 状态文件（端口/token）；/web 改造（首进程起服务+自注册、后续进程注册进已有服务）；进程表（processId/pid/kind/session/cwd）；事件上行 WS + 命令下行通道；浏览器广播带 processId；断开自动移除。

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] 状态文件读写 + 同 cwd 判定（首个 /web 起服务写文件；后续 /web 读文件注册不重启；--stop 宿主清文件）
- [ ] 注册协议：register → processId；事件上行（注册者 pi 事件 → 宿主）；命令下行（宿主 → 注册者 sendMessage/abort）
- [ ] 进程表管理（增删；WS 断开自动移除）+ 浏览器广播事件带 processId
- [ ] 宿主自注册（本地 entry，kind=host）
- [ ] 纯函数单测（状态文件解析/进程表）；npm test + typecheck 全绿
