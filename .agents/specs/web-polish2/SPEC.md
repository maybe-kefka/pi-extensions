# SPEC：web-polish2（工具栏整合 + 布局修正 + web_ask 注入时机）

迭代 slug：`web-polish2`。基线：web-instances（`.agents/specs/web-instances/SPEC.md`）及其全部迭代。本迭代为 UI/UX polish 轮（6 项用户反馈），无架构变更。

## Problem Statement

1. **水杯布局不协调**：chat input 左侧的水杯（h-16 64px）与输入框高度不一致（底部对齐），且偏窄。
2. **保存按钮位置错误**：文件保存按钮显示在 tab 栏（TabsBar）——vscode 惯例是编辑器内部工具栏；文件相关操作按钮应集中到文件视图标题栏（显示文件名的那一行）。
3. **全局 header 冗余**："pi web console" 顶部 header 已无实质内容（连接状态已由断线横幅表达）——占空间无信息。
4. **web_ask 注入时机错误**：web_ask_single/multi/text 三工具在扩展加载时无条件注入——未开 web 时 TUI 里 LLM 也会调用，回答投递无处可见（askRegistry 无 web 客户端消费）。
5. **tab 无法调序**：编辑器 tab 不能拖动改变顺序。
6. **会话侧边栏布局回归**："会话"标题与刷新按钮显示为上下布局（应为水平）。

## Solution

1. **水杯与 input 同 block 同高**：水杯容器与 InputBar 同高（高度 = input 高度），宽度 w-3.5（14px）。
2. **文件工具栏整合**：保存按钮从 TabsBar 移除 → EditorPane 标题栏（显示文件路径的那一行）变为 vscode 风格工具栏：**保存**（dirty 时显示）、**撤销/重做**（CodeMirror 编辑态）、**重新加载**（丢弃未保存改动从磁盘重读）。Ctrl+S 快捷键随迁到 EditorPane。
3. **Header 删除**：全局顶部 header 组件删除（连接状态由 DisconnectBanner 表达）。
4. **web_ask 连接才注入**：注册者连接 web 成功（agent 模式 welcome 后）才注册 web_ask_* 工具；未连接（TUI 无 /web）不注入——LLM 在无 web 时不再调用。注入带幂等守卫（重复连接不重复注册）。服务进程（--web 服务）不注入（无 LLM 会话）。
5. **tab 拖拽调序**：TabsBar 支持拖拽（HTML5 drag & drop）重排任意 tab（file/chat/diff 混合）。
6. **会话标题水平**：SessionPanel 的"会话"标题 + 刷新按钮改水平分布（纯 div 布局，不用 CardHeader 默认列布局）。

## User Stories

1. 作为用户，我希望水杯进度条与输入框在同一区块且同高、宽度合适，这样视觉协调。
2. 作为用户，我希望文件视图标题栏（显示文件名处）有 vscode 风格工具栏：保存（dirty 时）、撤销/重做、重新加载，这样文件操作都在一处。
3. 作为用户，我希望 tab 栏不再显示保存按钮，这样 tab 栏只表达文件身份与状态。
4. 作为用户，我希望顶部全局 header 消失，这样界面空间不被冗余栏占用（连接状态由断线横幅表达）。
5. 作为用户，我希望未打开 web 时 web_ask 工具不注入，这样 TUI 里 LLM 不会调用看不到回答的提问工具。
6. 作为用户，我希望打开 web 后 web_ask 工具可用，这样提问回答链路正常。
7. 作为用户，我希望 tab 可以拖动调换顺序，这样按工作习惯组织面板。
8. 作为用户，我希望会话侧边栏的标题与刷新按钮水平排列，这样标题栏紧凑。

## Implementation Decisions

- **水杯**：WaterCup 高度改为与 InputBar 同高（容器 `items-center` 对齐），宽度 w-3.5；水位分级逻辑不变（usage-tier）。
- **文件工具栏**（EditorPane 内部标题栏）：
  - 保存：dirty 时显示（调用内部 save——EditorPaneHandle 已有）
  - 撤销/重做：CodeMirror 视图 API（undo/redo dispatch）
  - 重新加载：确认后从磁盘重读（丢弃未保存改动）
  - Ctrl+S 处理从 TabsBar/App 迁移到 EditorPane（keydown 监听）
- **TabsBar**：移除保存按钮渲染（onSave prop 移除；Ctrl+S 不在此处理）
- **Header**：组件删除（含文件）；App 渲染移除；safe-area padding 移交主区容器
- **web_ask 注入**：`registerWebAskTools` 从扩展工厂无条件调用改为**连接回调**（connectToHost 成功/welcome 后）——需在 WebConsole 暴露连接成功钩子（回调注册），index.ts 接线（api 引用来自 bindApi 的 state）。幂等：模块级已注册标记。断开不移除（pi API 无 unregisterTool——接受）。
- **拖拽**：tabs.ts 加 `moveTab(state, fromId, toId)` 纯函数（同类型/跨类型均可，chat/file/diff 用各自 id 格式匹配）+ reducer action `move`；TabsBar 组件实现 draggable/onDragStart/onDragOver（插入位指示）/onDrop。
- **会话标题**：SessionPanel 标题区改纯 `div.flex items-center justify-between`（不用 CardHeader/CardTitle 默认列布局）。

## Testing Decisions

- **moveTab 单测**（tabs.test）：前移/后移/跨类型/非法 id 不变——纯函数 seam。
- **WaterCup 组件测试更新**：宽度类 w-3.5 + 容器高度断言。
- **EditorPane 工具栏组件测试**：dirty 显示保存、撤销/重做可用、重新加载触发回调。
- **TabsBar 测试更新**：保存按钮断言移除；拖拽回调（onDrop 触发 move）。
- **SessionPanel 布局测试**：标题行 flex-row 断言（jsdom className）。
- **web_ask 注入**：服务端为薄 IO 接线（不单测）——冒烟验证（未连接 TUI 无工具 / 连接后工具有）。
- **冒烟**：6 项逐一（水杯同高/工具栏按钮/tab 无保存/header 无/tab 拖拽/会话标题水平）。

## Out of Scope

- 断开 web 后 web_ask 工具移除（pi API 无 unregisterTool——工具保留但回答链路需要连接）。
- 拖拽跨窗口/跨列表；拖拽动画/自动滚动。
- 文件工具栏的更多按钮（格式化/保存全部等）。
- 会话标题栏的更多布局重构（仅水平修复）。

## Further Notes

- web_ask 注入守卫用模块级标记（factory 每次会话切换重跑——标记在模块作用域持久）。
- Ctrl+S 迁移后 TabsBar 不再感知保存（git 状态刷新联动仍在 EditorPane onSaved 链路）。
