# Sidebar Polish 迭代 SPEC

> 依据 `/skill:to-spec` 生成。seams：本迭代为纯 CSS/布局/交互打磨，无纯逻辑 seam——单测为零，验收走浏览器冒烟清单（与 themes 迭代的 DOM/UI 薄层先例一致）。

## Problem Statement

侧边栏与会话列表存在多处布局瑕疵：会话面板的刷新按钮被 shadcn CardHeader 的 grid 布局挤到标题下一行（会话在上、刷新在下，各自占一行）；会话项的功能按钮（重命名/查看树/删除）非 hover 时虽不可见但仍占位，挤压会话名展示；「当前」badge 与高亮背景语义重复；侧栏折叠/展开是瞬间显隐无过渡；「已连接」状态与标题垂直不对齐；输入框 chip 比正文略偏下。

## Solution

侧边栏会话区紧凑化：刷新按钮回到标题行（与「会话」同行）；会话项功能按钮非 hover 零占位、hover 时从右侧展开（宽度动画）；删除「当前」badge 只留高亮；侧栏折叠改为宽度过渡动画；「模型 / 思考」与「外观」面板去掉标题、label 拆到下拉框左侧；「已连接」与 chip 对齐修复。

## User Stories

1. 作为用户，我希望刷新按钮与会话标题同一行，这样不浪费一行高度
2. 作为用户，我希望会话项的功能按钮平时完全不占位，这样会话名完整展示
3. 作为用户，我希望 hover 会话项时按钮从右侧展开（有动画），这样操作入口不丢失且不突兀
4. 作为用户，我希望「当前」会话只靠高亮底色标识，这样不重复冗余
5. 作为用户，我希望侧栏折叠/展开有宽度过渡动画，这样视觉不突兀
6. 作为用户，我希望「模型 / 思考」面板没有大标题，每个下拉框左侧有「模型」「思考」小标签，这样面板更紧凑直接
7. 作为用户，我希望「外观」面板同样无标题、下拉框左侧有「主题」「深浅」小标签
8. 作为用户，我希望「已连接」状态与标题垂直居中对齐，这样视觉整齐
9. 作为用户，我希望输入框里的 chip 与正文文字垂直居中，这样输入不显错位
10. 作为用户，我希望上述打磨不影响现有功能（会话切换/重命名/删除/树导航/主题切换均照常工作）

## Implementation Decisions

- **刷新按钮同行**：Panel 的 action 元素包 `data-slot="card-action"`——shadcn CardHeader grid 机制（`has-data-[slot=card-action]:grid-cols-[1fr_auto]`）自动两列：标题左、刷新右——修复根因（当前缺该属性退化为 `grid-rows-[auto_auto]` 两行）
- **会话项功能按钮展开动画**：按钮容器由 `opacity-0 group-hover:opacity-100`（占位不显示）改为 `max-w-0 overflow-hidden opacity-0 group-hover:max-w-[3.75rem] group-hover:opacity-100 transition-[max-width,opacity]`（3 个 size-5 按钮 ≈ 60px）——非 hover 零宽度零占位，hover 时宽度+透明度渐变展开
- **删「当前」badge**：active 会话只保留 `bg-accent` 高亮 + 名称 font-medium
- **侧栏折叠动画**：Sidebar 组件折叠时不再 `return null`——保持挂载，`w-72 → w-0` + `overflow-hidden` + `border-l-0` + `transition-[width]`（内容随宽度裁切）；展开反向；`lg:flex` 容器不变；SidebarSheet（窄屏抽屉）不受影响
- **面板去 title 加 label**：「模型 / 思考」「外观」两个 Panel 改为无标题容器（不再用 Panel 组件）；每个 Select 外包 `flex items-center gap-2`，左侧 `<span className="w-8 shrink-0 text-xs text-muted-foreground">模型</span>` 式标签，Select `flex-1`
- **「已连接」垂直居中**：Header Badge 行高修正（`leading-none` 或等价），与相邻标题/按钮基线对齐
- **chip 对齐**：chip span 的 `vertical-align` 由 `align-middle` 调整为与正文一致的基线对齐（contenteditable 行盒内实测校准）
- **范围**：仅 `Sidebar.tsx` / `SessionList.tsx` / `Header.tsx` / `InputBar.tsx` / `card.tsx`（如需）的 class 与结构微调；不涉及逻辑/事件/RPC

## Testing Decisions

- 好测试的标准：本迭代无可测纯逻辑（无 reducer/无状态机/无新数据流）——引入单测只会测 class 字符串，无行为价值
- 先例：themes 迭代的 DOM/UI 薄层冒烟（浏览器实测）
- **验收方式：浏览器冒烟清单**——① 刷新与会话同行 ② hover 会话项按钮从右展开、非 hover 会话名完整 ③ 无「当前」字样、高亮保留 ④ 折叠/展开宽度动画 ⑤ 模型/思考/外观面板无标题、下拉框有左侧 label ⑥ 「已连接」垂直居中 ⑦ chip 与文字垂直居中 ⑧ 回归：会话切换/重命名/删除/主题切换正常

## Out of Scope

- 按钮展开动画的时长/缓动可配置
- 会话项按钮自定义（增删按钮）
- 窄屏抽屉（SidebarSheet）的动画
- TUI / pi-status 相关

## Further Notes

- 动画时长用 Tailwind 默认（150ms 左右），不引入自定义 duration
- Panel 组件在「会话」「状态桥接」面板继续使用（带标题）
