# 06 — 非核心 panels 与视觉 contract 收口

**What to build:** 完成 Files、Git 和跨 surface 的视觉 contract 迁移，清除本轮范围内剩余的主题绕过与不一致状态。用户在任一主题和主要 panel 中都获得统一 header、文字密度、状态色、focus 与 motion，同时所有文件和 Git 工作流保持原样。

**Blocked by:** 02 — 代码语法色迁移；03 — Shell、空态与窄屏导航；04 — Settings 与 Sessions 紧凑化；05 — Chat 与 context meter

**Status:** completed — `6376ccd`

- [x] Files 与 Git 的 header、排版、间距、hover/active/focus 与 scoped status 接入统一语义 contract
- [x] Git ahead/behind、文件状态及本轮触达 surface 不再使用绕过主题的硬编码 palette
- [x] scoped UI 中不存在遗漏的 raw palette、不可读小字、无替代 focus、无 reduced-motion 的非必要过渡或 `transition: all`
- [x] shared visual primitive 只承载跨 feature 的真实模式，不新增无语义薄 wrapper 或 speculative variant
- [x] Files 的浏览/编辑/diff/save 与 Git 的 refresh/stage/commit/branch/remote/stash 等现有行为不回归
- [x] 全部主题、feature 与回归测试通过，测试断言保持外部行为导向
- [x] `npm test` 与 `npm run typecheck` 通过
