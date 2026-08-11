# 04 — web_ask 连接才注入

**What to build:** web_ask_single/multi/text 三工具从"扩展加载即注册"改为"注册者连接 web 成功（agent 模式 welcome 后）才注入"；模块级幂等守卫（重复连接不重复注册）；服务进程不注入。

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] WebConsole 暴露连接成功钩子；index.ts 接线 registerWebAskTools（api 引用来自 bindApi）
- [ ] 未连接（TUI 无 /web）→ 不注入；连接后 → 注入；幂等
- [ ] 冒烟：无 /web 的注册者工具列表无 web_ask；/web 后出现 ✓
