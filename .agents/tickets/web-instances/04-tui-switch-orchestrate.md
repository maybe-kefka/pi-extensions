# 04 — TUI 切会话编排（排他 + 跟随）

**What to build:** TUI 注册者 session_start 时：若新会话有 spawn 实例 → 杀该实例（jsonl 双写排他）→ 对应 tab 标记"已由 TUI 接管" → web 激活 TUI 注册者 tab 并跟随新会话。编排逻辑为纯函数（事件 → 动作列表），web-console 只做 IO 接线。

**Blocked by:** 02（TUI 注册者接入）、03（spawn 会话实例）

**Status:** ready-for-agent

- [ ] 编排纯函数：session_start(会话 X) → [杀 X 的 spawn 实例、标记其 tab、激活 TUI tab、更新会话绑定]
- [ ] 被杀的实例对应 tab 显示"已由 TUI 接管"状态；TUI tab 跟随新会话（历史/发送正常）
- [ ] 无撞车实例时仅跟随（不杀）
- [ ] npm test + typecheck 全绿（编排全分支单测）；冒烟：TUI 切到 web 已开会话 → 实例终止 + web 跟随 ✓
