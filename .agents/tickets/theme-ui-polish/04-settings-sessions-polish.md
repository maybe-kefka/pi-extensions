# 04 — Settings 与 Sessions 紧凑化

**What to build:** 让 Settings 与 Sessions 融入统一的扁平工具面板语言。用户可以通过带 palette preview 的主题选择和 System/Light/Dark segmented control 快速理解当前外观设置；长模型名和会话标题保持紧凑但可获得完整内容。

**Blocked by:** 01 — Theme contract 与对比度基础；03 — Shell、空态与窄屏导航

**Status:** completed (`c031313`)

- [x] Settings 移除 dashboard card 堆叠，改为紧凑、层级清楚的扁平设置分组
- [x] 每个主题选项展示小型 palette preview，选择后即时应用且偏好持久化行为不变
- [x] scheme 使用 System / Light / Dark segmented control，当前状态和键盘操作清晰
- [x] 模型、思考、主题和 scheme 控件都有显式可访问名称与可见 focus 状态
- [x] 长模型名和长会话标题保持单行 compact，截断时通过 tooltip 与 accessible name 提供完整文本
- [x] Sessions 的切换、刷新、重命名、删除、树查看及当前状态行为不回归
- [x] 测试通过 role/name 和用户操作验证设置切换、主题预览、长内容入口与会话行为
- [x] `npm test` 与 `npm run typecheck` 通过
