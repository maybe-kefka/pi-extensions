# 03 — Shell、空态与窄屏导航

**What to build:** 将 ActivityBar、Tabs、docked panels 与空工作区统一为轻量、紧凑的开发者工具 Shell。用户能清楚识别当前工具和 tab，键盘与辅助技术获得正确状态；在极窄窗口中 panel 以 overlay 出现，不再压碎主工作区。

**Blocked by:** 01 — Theme contract 与对比度基础

**Status:** completed (`7d367ec`)

- [x] ActivityBar 使用柔和 active surface + 细 rail，并具备明确 hover、pressed/current、focus 和 accessible name
- [x] Tabs 的 active/inactive/dirty/close 状态层级清晰，空 workspace 不渲染无 child 的 tablist
- [x] Files、Git、Sessions、Settings 的 panel shell 使用一致的 flush header、border、spacing 与排版规则
- [x] 空工作区提供克制的 command-center 标题、说明和现有入口提示，不新增业务动作
- [x] 宽屏与 768px 窄分屏保持 docked panel；约 700px 以下改为 overlay，ActivityBar 与 panel 选择状态保留
- [x] overlay 可通过现有工具入口开关，焦点与滚动不被遮挡，无遮断主工作区的横向布局
- [x] 功能性过渡使用明确属性并尊重 reduced-motion，不出现 `transition: all`
- [x] 组件测试验证角色、名称、用户选择与空态行为，不断言 class 字符串或几何像素
- [x] `npm test` 与 `npm run typecheck` 通过
