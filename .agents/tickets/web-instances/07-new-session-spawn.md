# 07 — 新建会话 spawn 实例

**What to build:** "新建会话"按钮 → 服务进程 spawn 新实例（`--session-id` 新 id）→ 自动注册 → 自动打开新 tab（时间戳命名）→ 完整对话。新建会话与打开历史会话走同一条 spawn 路径。

**Blocked by:** 03（spawn 会话实例）

**Status:** ready-for-agent

- [ ] 新建会话 → spawn 新实例（argv/env 纯函数扩展 --session-id 分支）→ 自动开 tab
- [ ] 新 tab 完整对话（发送/流式/web_ask）；会话管理列表出现新会话
- [ ] npm test + typecheck 全绿（spawn 构造/编排单测）；冒烟：新建 → 独立进程 → 对话 → 会话列表可见 ✓
