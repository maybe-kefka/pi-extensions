# Theme & UI Polish 迭代 SPEC

> 依据 `/skill:to-spec` 生成。测试 seams 已按用户授权确认：Theme contract 纯函数 seam + rendered feature 行为 seam；响应式与视觉品质走浏览器冒烟。

## Problem Statement

pi-web 已具备完整的编辑器式工作区和 5 套浅深主题，但视觉系统仍停留在多次迭代叠加后的局部样式：Shell、Chat、工具面板与设置区混用扁平 IDE 和 dashboard card 两种语言；主题只覆盖基础颜色，代码语法色、状态色和若干 chip 绕过主题或使用断链变量；多套主题的小字对比度不足，真实浏览器中最低约 1.8:1；窄窗口展开侧栏会把主工作区压到不可用；部分交互缺少正确的 accessible name 或 ARIA 语义。用户希望在不改变现有功能心智的前提下，将 pi-web 打磨成统一、克制、精致且高密度的开发者工具。

## Solution

以 DeepSeek Harness 的安静阅读画布、柔和中性层级和一体化 composer 为直接视觉参照，建立一个由语义 token 驱动的视觉系统，并用它完整重塑 Shell 与 Chat、统一其余工具面板的基础语言。保留现有 5×2 主题、主题标识、用户偏好和默认行为，但允许重新校准具体色值，使主题个性集中在强调色、状态色和代码语法，而不是大面积染色的背景与边框。编辑器与 Markdown 使用独立的 syntax token，不再借用 chart token。现有 ActivityBar、Files、Git、Tabs 和多工作区信息架构保持不变，但 ActivityBar 与打开的侧面板在视觉上组成一个连续 sidebar；主工作区成为低噪声阅读画布，过程信息使用扁平时间线，一体化 composer 作为主要 raised surface；窄屏侧栏转为 overlay。

现有主题选择、偏好持久化、系统深浅跟随与首帧防闪行为沿用 Themes 迭代 SPEC §Solution / §Implementation Decisions；编辑器式 ActivityBar、侧面板、Tabs 与工作区心智沿用 vscode-align SPEC §Solution，不在本迭代重建。

## User Stories

1. 作为 pi-web 用户，我希望 Shell、Chat、工具面板和设置区使用同一套视觉语言，这样界面看起来是一个完整产品而不是多套组件的拼接。
2. 作为高频使用者，我希望界面保持紧凑但文字清楚，这样窄分屏能容纳足够信息且无需费力辨认。
3. 作为主题用户，我希望现有 GitHub、One Dark、Dracula、Nord、Tokyo Night 及其浅深变体全部保留，这样升级不会删除我的选择。
4. 作为已有用户，我希望当前主题、深浅偏好与本地持久化继续生效，这样升级后无需重新设置。
5. 作为新用户，我希望默认仍为 GitHub 并跟随系统深浅，这样默认行为保持可预期。
6. 作为主题用户，我希望每套主题的正文、辅助文字和控件都有足够对比度，这样任何主题都能长期使用。
7. 作为编辑代码的用户，我希望 CodeMirror 语法色真正跟随当前主题，这样切换主题不会残留默认配色。
8. 作为阅读代码消息的用户，我希望 Markdown code block 与编辑器共享一致的语法角色，这样同类代码具有一致语义。
9. 作为查看状态的用户，我希望 success、warning、danger 等状态在所有主题中含义稳定，这样不必重新学习颜色。
10. 作为主题用户，我希望状态色在每套主题中都协调且可读，而不是使用突兀的固定色值。
11. 作为导航用户，我希望 ActivityBar 的 active、hover 与 focus 状态清晰可辨，这样能快速确认当前工具面板。
12. 作为键盘用户，我希望 ActivityBar 使用正确的可访问语义和清晰 focus ring，这样辅助技术与视觉反馈一致。
13. 作为多标签用户，我希望 active tab 清晰但不过度抢眼，inactive tab 仍可读，这样能快速定位当前内容。
14. 作为工具面板用户，我希望 Files、Git、Sessions 与 Settings 使用一致的 header、间距和分隔规则，这样切换面板时认知稳定。
15. 作为设置用户，我希望 Settings 使用紧凑的扁平分组，而不是宽度有限的 dashboard cards，这样内容密度适合侧栏。
16. 作为主题设置用户，我希望看到每个主题的小型色板预览，这样选择前能理解主题特征。
17. 作为主题设置用户，我希望通过 System、Light、Dark 分段控件选择深浅模式，这样三种状态一眼可见。
18. 作为辅助技术用户，我希望 Settings 的所有选择控件都有可访问名称，这样可以理解每个控件控制什么。
19. 作为聊天用户，我希望 assistant 内容融入阅读画布、user 内容有克制的区分，这样长会话更接近可扫描的工作记录。
20. 作为聊天用户，我希望 thinking、tool、progress 等过程信息使用紧凑的 inset block，这样过程可查但不压过最终回答。
21. 作为输入用户，我希望 composer 与消息区有轻微层级区分，这样输入位置稳定可见但不过度悬浮。
22. 作为上下文敏感的用户，我希望 context meter 直接显示可扫读的占用程度，并保留详情入口，这样不再依赖猜测水杯图标。
23. 作为没有打开内容的用户，我希望空工作区提供清晰的标题、说明与现有入口提示，这样知道下一步能做什么。
24. 作为使用长模型名或长会话标题的用户，我希望紧凑列表不被撑坏，同时能通过可访问提示获得完整文本。
25. 作为窄分屏用户，我希望侧栏和工具栏不会把主内容压碎，这样在有限宽度下仍能阅读和输入。
26. 作为极窄窗口用户，我希望侧栏转为 overlay 且选择状态不丢失，这样可以临时访问工具后回到完整主区。
27. 作为减少动态效果的用户，我希望界面尊重 reduced-motion 设置，这样过渡不会造成不适。
28. 作为鼠标用户，我希望 hover、active、disabled 和 destructive 状态一致且明确，这样操作结果可预期。
29. 作为键盘用户，我希望所有本轮涉及的交互都有可见 focus 状态且不会被 sticky 区域遮挡。
30. 作为 Git 用户，我希望 ahead/behind 与文件状态色接入语义主题，同时现有 Git 操作完全不变。
31. 作为文件用户，我希望文件树与编辑器保留现有紧凑结构，只改善颜色、层级与交互状态，这样已有操作习惯不被打断。
32. 作为会话用户，我希望会话切换、重命名、删除与树查看行为不变，这样视觉升级不会带来功能回归。
33. 作为维护者，我希望主题目录是单一事实源且生成结果能被 CI 校验，这样 token 不再发生静默漂移。
34. 作为维护者，我希望视觉测试验证外部行为和可访问语义，而不是锁定 class 字符串，这样内部重构不会制造无价值回归。
35. 作为验收者，我希望看到相同尺寸的前后对比截图与主题/宽度检查清单，这样能直接判断本轮视觉价值。
36. 作为长会话用户，我希望正文拥有接近阅读器的字号、行距与居中宽度，这样连续阅读不会像在看密集日志。
37. 作为观察 agent 过程的用户，我希望 thinking、tool 与 progress 是轻量时间线而不是层层带框的卡片，这样过程可查但不会割裂最终答案。
38. 作为输入用户，我希望输入、上下文状态和主要操作被组织在一个完整 composer 内，这样底部不会像多个零件临时拼接。

## Implementation Decisions

- **视觉 north star**：pi-web 是面向开发者的本地 coding cockpit，DeepSeek Harness 是本轮直接视觉参照。借用其近乎无色的主画布、柔和 sidebar、低透明 active row、居中阅读列、无 avatar 的 assistant 内容、扁平过程时间线和一体化圆角 composer；不复制其单一 sidebar、Chat/Trajectory 产品结构或业务控制。界面避免高对比边框网格、整页主题色铺底和装饰性渐变。
- **Theme contract 深模块**：主题目录继续是 palette 与语义角色的单一事实源；对外提供稳定的主题标识、浅深 token 集与确定性 CSS 生成接口。生成流程隐藏命名转换和 selector 拼装，调用者与测试只通过生成接口观察完整结果，避免手工复制形成双事实源。
- **兼容性**：保留 5 个 theme ID、显示名称、light/dark 两态、偏好存储格式和 GitHub/System 默认。允许调整所有具体色值，但不迁移或清除已有偏好。
- **语义 token**：在现有基础角色上补充实际使用的 canvas、panel、sunken、raised、overlay、sidebar、editor、hover、active、focus、success、warning、danger 及对应 foreground；不为本轮没有消费者的场景建立 speculative token。
- **语法 token**：新增 keyword、type、function、string、number、operator/property、comment 等 syntax 角色。CodeMirror 与 Markdown highlighting 共享这些角色；chart token 仅用于数据可视化。现有 chart 命名断链必须消除。
- **状态颜色**：success 保持绿色语义、warning 保持暖色语义、danger 保持红色语义，Git 与上下文容量等领域状态通过语义角色消费；每套主题可调整亮度与饱和度以满足对比度，不再在 feature 内硬编码 Tailwind palette。
- **对比度**：普通文字至少 4.5:1；大文字、图标、focus ring、控件边界和关键非文本状态至少 3:1。透明度叠加后的最终渲染结果也必须满足门槛，不能只验证原始 hex。
- **层级与形状**：主画布、Tabs 和 docked sidebar 保持 flush；ActivityBar 与打开的 panel 共享 sidebar surface，只在整个 sidebar 右缘保留一道低对比分隔。列表 active row 使用约 6% 的柔和填充与 8px 圆角。button/input 使用 8–12px 圆角，popover/dialog/composer 使用 18–22px 圆角；阴影只用于 composer 与真正离开文档流的浮层。
- **排版**：使用系统 UI 字体栈；代码、路径、快捷键、占用数字和其他机器数据使用 monospace。工具 UI 以 14px 为基线，聊天正文 15–16px、约 24px 行高，辅助文字不低于 12px；数字比较使用 tabular figures；长文本容器具备 `min-width: 0`、截断及完整信息提示。
- **动效**：hover、popover、panel 与交互状态使用 120–180ms 的 transform/opacity/明确属性过渡，禁止 `transition: all`；reduced-motion 下关闭非必要过渡。主题切换不加入大面积花哨动画。
- **Shell**：ActivityBar 与 panel 视觉合并为一个柔和 sidebar 平面，panel 打开时不在两者之间重复画边界；active 状态用中性浅填充，主题色只作小面积强调和 focus。Tabs 使用克制 underline，所有侧面板统一 header、间距、hover/active/focus 规则。Settings/Sessions 使用柔和的扁平分组，只有真正独立的内容使用 raised surface。
- **Chat**：消息列最大宽度约 780px，assistant 内容直接融入 canvas 且不显示装饰 avatar，user 内容使用克制的柔和气泡；thinking/tool/progress 改为带小图标、标签和摘要的扁平时间线行，不使用逐项边框卡片。保持所有流式、fork、ask、tool 与输入行为不变。
- **Composer 与 Context meter**：输入区、上下文状态和主要操作组成一个约 18–22px 圆角的完整 composer，使用细边界与轻阴影；占用信息以紧凑图标/百分比控件进入底部 metadata row，并继续提供可访问的进度语义和现有详情。正常、提醒、危险阈值沿用既有领域规则。
- **Theme settings**：主题选择显示小型 palette preview；scheme 使用 System / Light / Dark segmented control；选择即时应用。设置控件具备显式可访问名称。
- **空态与长内容**：空工作区显示克制的 command-center 引导，只复用现有入口，不新增业务动作。模型名和会话标题保持单行 compact，通过 tooltip 与 accessible name 提供完整内容；默认 panel 宽度不因内容自动跳动。
- **响应式**：宽屏与窄分屏保持 docked panel；约 700px 以下 panel 变为 overlay，ActivityBar 保留，当前 panel 选择状态不丢失。使用 CSS layout/media query，不在 render 中测量布局；不新增完整 mobile navigation。
- **可访问性**：优先使用原生语义；ActivityBar 不再把普通 button 伪装为 selected tab，改用与行为一致的 pressed/current 语义；空 workspace 不渲染无 child 的 tablist；所有 icon-only button、form control 和 interactive state 具备名称、键盘行为与 focus-visible 样式。
- **FSD 责任**：theme entity 持有主题契约与纯生成逻辑；shared UI 持有无领域含义的视觉 primitives；ActivityBar、Settings、Chat、context meter 等 feature 组合 primitives 并持有各自交互；app 只负责布局和 wiring。避免为了样式创建无语义的薄 wrapper。
- **非核心 panel 边界**：Files、Git、Sessions 仅替换硬编码颜色、统一 header/排版/间距/状态和修复本轮发现的 a11y；不改变信息架构、RPC 或操作流。

## Testing Decisions

- 好测试只观察模块 interface 的结果与用户可见行为，不检查内部转换步骤、具体 className 或 DOM 实现细节；视觉 refactor 后仍应保持稳定。
- **Theme contract seam**：通过公开主题目录和纯 CSS 生成接口覆盖 5 主题 × 2 scheme，验证 token 完整性、hex/有效颜色、稳定 theme ID、语义角色存在、syntax/chart 命名不串线、输出 selector 与变量一致、生成结果无 drift。
- **Contrast gate**：对全部 10 个变体验证 foreground/background、muted foreground/其承载 surface、primary pair、accent pair、danger/success/warning 文字或图标组合、focus 与边界等实际组合；计算透明度叠加后的颜色。测试失败信息包含 theme/scheme/token pair，方便校准 palette。
- **Rendered feature seam**：沿用现有 jsdom + React Testing Library 先例，通过 role/name 与用户动作验证 ActivityBar 当前状态语义、Settings 控件标签与即时选择、空 Tabs 行为、空工作区引导、context meter 的可读占用与详情入口、Chat 关键消息层级，以及长文本完整信息入口。
- **回归原则**：现有 Chat、Input、Tabs、Files、Git、Sessions 组件行为测试继续通过；只在外部呈现契约改变时更新断言，不删除业务行为覆盖。
- **不自动化的部分**：不测试像素、Tailwind class 字符串、动画帧或 jsdom 无法表达的 responsive geometry；不引入截图回归系统。
- **浏览器冒烟**：GitHub Light 与 One Dark Dark 完整检查 Shell、Chat、Files、Git、Sessions、Settings、编辑器和代码块；其余 8 个变体快速检查 palette、状态与可读性。视口覆盖 1440×900、768×700、480×800，并验证窄屏 panel overlay、键盘 focus、theme 持久化、无 console error。
- **视觉交付**：实现前后的关键界面使用相同视口与状态截图，作为临时验收材料；并与 DeepSeek Harness 的 sidebar、阅读列、过程时间线、composer 和浮层层级逐项比较；不提交仓库。

## Out of Scope

- 新增、删除、重命名主题或改变 theme ID
- 用户自定义 theme editor、主题导入导出或跨设备同步
- density 切换与额外外观偏好
- 完整移动端导航或触控优先重构
- Files、Git、Sessions 的信息架构、RPC 或业务流程重构
- Storybook、设计展示页、自动截图回归服务
- 新字体、动画库、CSS framework 或其他 UI 依赖
- 与视觉系统无关的业务功能
- pi TUI、pi-status 与其他 package 的主题改造

## Further Notes

- 本轮首先修复已确认的确定性问题：自定义主题 syntax/chart 变量断链、feature 硬编码 palette、低对比度 muted 文本、ActivityBar ARIA、Settings label 和空 tablist。
- 真实浏览器基线表明编辑器结构与布局本身可用，开发时应保留其信息架构，将投入集中在 token wiring、contrast 与 Shell/Chat 统一。
- 约 480px 宽度下 docked panel 会把主区压到不可用；overlay 是验收所需行为，不是可选 polish。
- Tickets 按可独立验收的垂直增量组织；每片完成测试与类型检查后提交，最终进行 Standards / Spec 双轴审查并修复全部 findings。
- 首轮实现经真实浏览器检查后，用户明确认为视觉结果过于生硬，并指定 DeepSeek Harness 为参照；后续视觉对齐以本 SPEC 更新后的 north star 为准，首轮行为与主题基础作为可复用底座而非最终设计。
