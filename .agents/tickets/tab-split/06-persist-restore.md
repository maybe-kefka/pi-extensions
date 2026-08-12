# 06 — localStorage 持久化 + 恢复

**What to build:** 分区布局全量持久化：分区结构 + 各组 tabs（含 active）+ 各层 ratio 序列化到 localStorage（独立键、版本化）；刷新页面恢复完整布局——chat 会话已不存在时显示 dead 态可手动复活（复用现有兜底）；损坏/旧格式数据兜底为单空 leaf。
**Blocked by:** 03

**Status:** ready-for-agent

- [ ] serialize/deserialize 全量：round-trip（多级嵌套 + 多组 tabs + ratio）；损坏数据/旧格式 → 单空 leaf 兜底；版本字段
- [ ] 加载接线：App 初始化读 localStorage 恢复树；保存时机（树变化后持久化）
- [ ] 恢复的 chat tab 会话不存在 → dead 态 + 可复活（现有 markChatDead/onRevive 路径复用）
- [ ] 浏览器冒烟：分区 + 各组 tab + 比例 → 刷新 → 完整恢复
