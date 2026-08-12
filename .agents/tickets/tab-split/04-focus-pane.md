# 04 — 聚焦区 + 外部打开路由 + agent 生命周期

**What to build:** 引入"聚焦区"（最后交互的分组）：会话管理点击会话、文件树打开文件、打开 diff、agent 新注册会话——这些外部打开的 tab 进入聚焦区（从未交互时 = 第一组）；agent 离开时从所在组移除（空组合并兜底）；"激活 chat 切换 TUI 进程会话"effect 改为跟随聚焦区的激活 chat。
**Blocked by:** 03

**Status:** ready-for-agent

- [ ] 聚焦区状态：点击任意组 tab / 拖入 tab 更新聚焦区；外部打开（会话管理/文件树/diff/agent join）落点 = 聚焦区；从未交互 = 第一组
- [ ] agent join → 聚焦区开 chat tab；agent leave → 从所在组移除（含 dead 保留逻辑不回归）
- [ ] 会话切换 effect 跟随聚焦区激活 chat（TUI 单实例切换语义保持）
- [ ] 纯函数 + 组件测试覆盖路由逻辑；现有 agent 生命周期用例回归绿
