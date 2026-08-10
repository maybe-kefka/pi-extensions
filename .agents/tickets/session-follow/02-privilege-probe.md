# 02 — privilege-probe

**What to build:** 特权能力状态主动探测与降级提示闭环：`session_start` 时服务端用探针检测特权 ctx 有效性 → 广播 `privilege_status {ok}`；前端据此立即显示/清除降级提示条（不再等操作报错、恢复后自动消失）；`/web` 重跑时广播 ok 自动恢复；提示条文案说明"对话正常 + 如何恢复"。

**Blocked by:** 01 — follow-switch

**Status:** ready-for-agent

- [ ] `probePrivileged` 纯函数（null → false；正常 → true；stale/异常 → false）单测覆盖
- [ ] 服务端 `session_start` → 探测 + 广播 `privilege_status {ok}`；探测失败置 `state.privileged = null`
- [ ] `/web` handler isRunning 分支 → 广播 `privilege_status {ok: true}`（恢复检测）
- [ ] 前端监听 `privilege_status` → `setDegraded(!ok)`（替换只 set 不 reset 路径；privilegedError 兜底保留）
- [ ] 提示条文案：「已切换到新会话：对话正常；切换/新建/树导航需在 TUI 输入 /web 恢复」
- [ ] `npm test` + `npm run typecheck` 全绿
- [ ] 冒烟：TUI（rpc 模拟）切换 → 提示条立即出现；重跑 /web → 提示条消失；web 内切换 → 不出现提示条
