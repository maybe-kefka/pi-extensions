# 05 — Chat 与 context meter

**What to build:** 将 Chat 重塑为可扫描的 coding transcript：assistant 内容融入画布，user 内容以克制 surface 区分，thinking/tool/progress 使用紧凑 inset block，composer 稳定可见；原水杯升级为能直接读懂占用程度的 context meter，并保留详情入口。

**Blocked by:** 01 — Theme contract 与对比度基础；03 — Shell、空态与窄屏导航

**Status:** completed — `e41825a`

- [x] assistant、user、thinking/tool/progress 与 compact record 具有清楚但克制的消息层级
- [x] composer 使用轻微 raised surface，输入、mention、发送、停止、队列与 busy 状态行为不变
- [x] chip 与工具栏不再硬编码 purple/sky 等 palette，改用 theme-aware semantic roles
- [x] context meter 显示可扫读图标、进度和占用信息，正常/提醒/危险沿用既有领域阈值并消费语义状态色
- [x] context meter 保留 progressbar 可访问语义和现有详情入口，空值与边界值表现明确
- [x] 空聊天提供简洁可操作的首条消息引导，长会话仍保持现有滚动、streaming、fork、ask 与 progress 行为
- [x] 组件测试验证消息角色、meter 值/名称/详情入口和用户行为，不断言纯视觉 class
- [x] `npm test` 与 `npm run typecheck` 通过
