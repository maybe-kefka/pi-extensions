# 07 — 对齐 DeepSeek Harness 视觉语言并完成浏览器收口

**What to build:** 在不改变现有 IDE 信息架构与业务行为的前提下，按 DeepSeek Harness 的视觉语言重新打磨本轮 Shell、Chat、composer、Settings 和通用 surface。将高对比边框网格与大面积主题染色替换为柔和中性层级，使 ActivityBar 与 panel 成为连续 sidebar，使长会话成为居中阅读画布，使 agent 过程成为扁平时间线，并把输入、上下文状态和主要操作组织为一个完整 composer。同时修复首轮真实浏览器验收发现的对比度与可访问性缺陷。

**Blocked by:** 01、02、03、04、05、06

**Status:** complete

## Acceptance criteria

- [x] 保留 ActivityBar、panels、Tabs、split workspace、Files、Git、Sessions 与 Settings 的现有行为和信息架构，不照搬参考站业务结构
- [x] ActivityBar 与打开的 panel 共享柔和 sidebar surface，内部无重复强边界，整个 sidebar 仅在右缘形成清晰但克制的分隔；active row 使用中性浅填充而不是高饱和色块
- [x] 主题大面积 canvas/sidebar/panel/raised surface 使用协调的中性色；主题个性主要通过 accent、状态和 syntax 表达，GitHub Light 与 One Dark Dark 均不呈现高对比边框网格
- [x] Chat 阅读列最大宽度约 780px，正文达到 15–16px 与舒适行距；assistant 无装饰 avatar/气泡，user 使用克制的柔和气泡
- [x] thinking、tool、web ask 与 progress 使用可扫描的扁平时间线语言，不形成重复的 bordered cards，展开、滚动、fork 与详情行为不回归
- [x] composer 是一个完整的 18–22px 圆角 raised surface，输入、上下文占用和主要操作在同一视觉容器内；上下文仍具备 progressbar 语义、可读状态与详情入口
- [x] Settings、Select、Popover、Dialog 与列表状态使用参考站式柔和 surface、低噪声分隔和适度圆角；窄 sidebar 内仍紧凑可用
- [x] 10 个主题的正文、辅助文字、语法文字与实际控件承载面满足 SPEC 对比度门槛，包括已确认失败的浅色 syntax 与 One Dark Dark 选择控件
- [x] Tabs 的 tablist 仅包含合法 tab children，关闭操作不破坏键盘切换；Chat composer 与 CodeMirror textbox 都有 accessible name
- [x] 可滚动 thinking/editor 区域键盘可达，Chat 不产生重复或嵌套 main landmark，空工作区具备页面主标题语义
- [x] Select 浮层不产生稳定的 aria-hidden-focus 或断开的 aria-labelledby；历史 Markdown 空表头不会生成无名称 header
- [x] 1440×900、768×700 与 480×800 的真实浏览器冒烟通过；480px panel 继续 overlay，主 Chat 不被压碎；无 console/network error
- [x] 同尺寸 after 截图清楚体现连续 sidebar、低噪声层级、居中阅读列、扁平过程时间线与一体化 composer，并相较首轮截图具有明显视觉改善
- [x] `npm test`、`npm run typecheck` 与 client build 全绿

## Review closeout

- 双轴审查与独立浏览器验收补充项已收口：实际承载面对比、Tabs 删除后的焦点恢复、thinking 非 landmark 语义、真实 CodeMirror DOM seam，以及 WebAsk/Settings/Sessions 的连续扁平 surface。
