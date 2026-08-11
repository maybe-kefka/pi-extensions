# 03 — 历史会话独立实例

**What to build:** 打开历史会话 → 服务进程 spawn `--session <file>` 实例（`--mode rpc --extension <入口>` + 自动注册 env，stdin pipe 保活，cwd = 会话 cwd）→ tab 绑定该实例并加载历史，完整对话（发送/流式/工具/web_ask）；同会话单 tab（会话管理标记已开，点击激活已有 tab 不重复开）；**核心验收：A tab 跑长任务时切到 B tab 发消息，A 不 abort 继续跑**。

**Blocked by:** 02（TUI 注册者接入——注册/绑定/通道路径先立）

**Status:** ready-for-agent

- [ ] 会话管理打开历史会话 → spawn 实例（argv/env 由纯函数构造，含空格路径用例）→ 自动注册 → tab 出现
- [ ] 实例直接加载目标会话（--session 文件），历史显示
- [ ] spawn 实例 tab 完整对话（发送/中止/流式/web_ask 回答）
- [ ] 同会话单 tab：已开 → 激活已有；未开 → 新建
- [ ] npm test + typecheck 全绿（spawn 参数构造单测 + 编排单测 + tab 状态机）；冒烟：**双 tab 并行长任务互不 abort** ✓
