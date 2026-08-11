# 05 — tab 生命周期（关杀 / 断线 / respawn）

**What to build:** 关闭 spawn 实例 tab → SIGTERM 优雅终止实例（jsonl 落盘）彻底释放；实例意外退出（崩溃/被杀）→ 对应 tab 断线标记（可重新拉起）；重新打开已关闭会话 → respawn + 历史加载恢复。

**Blocked by:** 03（spawn 会话实例）

**Status:** ready-for-agent

- [ ] 关 tab → 实例 SIGTERM → 进程表移除；重开同会话 → respawn + 历史恢复
- [ ] 实例崩溃（kill -9 模拟）→ 注册表清理 → tab 断线态（非加载态卡死）
- [ ] 断线 tab 提供"重新拉起"动作（respawn 同会话）
- [ ] npm test + typecheck 全绿（编排单测：关/断线/respawn 分支）；冒烟：关 tab 进程消失、kill 实例断线、重开恢复 ✓
