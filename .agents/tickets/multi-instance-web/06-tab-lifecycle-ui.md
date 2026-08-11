# 06 — tab 生命周期 + UI

**What to build:** 每 chat tab 常驻挂载（Chat+InputBar hidden 保状态——input 不丢）；关闭语义（宿主不可关 / spawned 终止 / external 注销）；TabsBar 多 chat tab（session 名）；"新建会话"按钮 → 宿主 spawn 对等实例（环境变量自动注册）+ 开 tab。

**Blocked by:** 05 — chat tab 状态机

**Status:** ready-for-agent

- [ ] 多 chat tab 渲染（每 tab Chat+InputBar 常驻 hidden；切 tab 输入保留——冒烟验证）
- [ ] 关闭语义：宿主 tab 无关闭钮；spawned 关=终止实例；external 关=注销（进程继续）
- [ ] TabsBar 多 chat tab 显示 session 名；新建会话按钮 → spawn + 开 tab 激活
- [ ] npm test + typecheck 全绿 + 冒烟（多实例共享）
