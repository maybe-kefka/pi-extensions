# 01 — 服务进程模式 + 空态引导

**What to build:** `pi-web`（或 `pi --web` 字面）独立启动 web 服务进程：rpc 模式常驻、无 TUI、不注册自己；状态文件角色反转（服务进程写端口/token/pid，注册者读）；浏览器打开 web 时无任何注册进程 → 显示空态引导（提示"在 pi 里运行 /web 注册会话"）。

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] `pi-web` bin 启动服务进程（`--mode rpc --extension <入口> --web` 等价；`--web` argv 检测），进程常驻、无 TUI
- [ ] 状态文件 `.pi/web.json` 由服务进程写（端口/token/pid），旧"宿主"角色字段语义迁移
- [ ] 服务进程不注册自己、不产生会话 tab
- [ ] 浏览器打开 → 空态引导文案（无注册者时）
- [ ] npm test + typecheck 全绿（编排/解析单测 + 空态组件测试）；冒烟：`pi-web` 起服务 → 浏览器空态 ✓
