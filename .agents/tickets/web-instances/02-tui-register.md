# 02 — TUI 注册者接入

**What to build:** TUI 进程 `/web` 语义改为"注册自己"：无服务进程时自动 spawn 服务进程（detached）再注册；注册后 web 出现 TUI 当前会话 tab（普通注册者 tab：可关、注册保留、重开即回）；TUI tab 完整对话（发送/流式/工具事件/web_ask 回答——命令下行通道复用）。

**Blocked by:** 01（服务进程模式）

**Status:** ready-for-agent

- [ ] `/web` 无服务 → 自动 spawn 服务进程 → 就绪后注册；有服务 → 直接注册
- [ ] TUI 注册 → web 出现当前会话 tab；TUI session_start → tab 会话绑定更新
- [ ] TUI tab 发送/中止/web_ask 回答 → 命令下行执行；流式事件上行显示
- [ ] TUI tab 可关（注册保留；重开即回）；服务进程存活时 TUI 进程退出 → 注册清理（进程表移除）
- [ ] npm test + typecheck 全绿（编排单测：注册/spawn 服务决策 + 注册协议解析）；冒烟：TUI `/web` → web tab 对话 ✓
