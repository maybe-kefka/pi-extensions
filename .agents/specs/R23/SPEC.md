# R23 SPEC：前端性能修复（vercel-react-best-practices 审查落地）

## 背景

用 `vercel-react-best-practices` skill 审查 `src/client` 前端后，按影响排序落地 F1–F5（React Compiler 已覆盖组件级 memo，以下均为编译器无法优化的热路径）：

1. **F1 流式每 token 全量 ReactMarkdown 重解析**（`Chat.tsx` StreamingSteps → `markdown.tsx`）：每个 `text_delta` 对全文重新 react-markdown 解析 + rehype-highlight 高亮 → 大回复累计 O(n²)，流式期间主线程卡顿
2. **F2 工具流式时所有历史气泡全量重渲染**：每个 `tool_update` → `state.tools` 新引用 → 所有 TurnBubbleView 的 props.tools 变化 → 历史气泡（含 final Markdown）重渲染
3. **F3 ToolCard `JSON.stringify(row.args)` 每渲染执行**：工具流式每 delta 重渲染时反复序列化大 args
4. **F4 InputBar `mentionItems` 每键击全量重建**：`mention.query` 每 keydown 变化 → skills/commands/files 全量扁平化 + filter 重跑
5. **F5 流式 dispatch 未包 startTransition**：高频流式事件同步渲染阻塞输入/滚动

## User Stories

**US1（P1）流式文本轻量渲染**：流式中（active turn）text 块渲染纯文本（whitespace-pre-wrap + ▍）；终态/过渡轮（active=false）保持 Markdown 渲染。格式只在最终回复出现（用户决策 Q1=a）。

**US2（P1）历史气泡隔离重渲染**：每个气泡只接收与其相关的工具行（引用稳定缓存）；工具流式时历史气泡（bubble 未变 + rows 元素引用未变）不重渲染。

**US3（P2）ToolCard 惰性序列化**：args 序列化结果按 `row.args` 引用 memo；展开区 JSON 仅展开时渲染。

**US4（P2）mentionItems 双层 memo**：base items（skills/commands/files 扁平化）与 query 过滤拆分——query 每键击变化只跑 filter，不重建扁平化。

**US5（P2）流式事件 startTransition**：仅高频流式事件（text_delta / thinking_delta / tool_update）包 `startTransition`；消息边界事件（message_start/end、turn_*、history、conn 等）保持同步（用户决策 Q2=a）。

## 验收场景

### US1
- AC1：流式中 text 块 DOM 为纯文本（无 markdown-body 结构），含 ▍
- AC2：终态最终回复仍为 Markdown 渲染（现有行为不变）
- AC3：过渡轮（活跃轮无内容显示上一轮）与终态工具轮（active=false）text 块为 Markdown

### US2
- AC1：同一气泡相关行元素引用未变时返回缓存数组（引用稳定）
- AC2：行内容变化（output 更新）时新数组
- AC3：历史气泡在纯 text_delta 流式中不重渲染（组件测试：渲染计数不增）

### US3
- AC1：折叠态 preview 不序列化大 args（截断/惰性）；展开态显示完整 JSON
- AC2：args 未变时序列化结果不重算（row 引用变化不影响 argsJson）

### US4
- AC1：skills/commands/files 引用未变时 base items 不重建（引用稳定）
- AC2：query 变化只 filter（行为不变：现有 @ 触发/过滤测试全绿）

### US5
- AC1：`isTransitionalAction` 对 text_delta/thinking_delta/tool_update 为 true，其余事件为 false
- AC2：App onEvent 按分类 dispatch（transition / 同步）；流式行为冒烟不变

## FR

- FR-001：Chat.tsx StreamingSteps text 块分支：`active` → 纯文本 span；否则 `<Markdown>`；▍ 仅 active 且最后 text 块
- FR-002：纯函数 `toolsForBubble(bubble, rows, cache)`（新文件 `chat-stream/tools-for-bubble.ts`）：按 `bubbleToolCallIds` 过滤 + 引用稳定缓存（元素引用全同则返回缓存数组）；Chat.tsx 用 ref 持有 cache，每气泡调用
- FR-003：Chat.tsx TurnBubbleView 的 tools prop 改为 per-bubble rows（ProgressDialog 同样接入）；依赖 React Compiler 的 props 引用比较实现历史气泡跳过
- FR-004：ToolCard：`argsJson = useMemo(…[row.args])`；preview 用 `row.output.trim() || argsJson`；展开区 `JSON.stringify(row.args, null, 2)` 保持（仅 open 渲染）
- FR-005：InputBar：`baseFileItems` / `baseSkillCommandItems` 两个 useMemo（依赖 `[files]` / `[skills, commands]`）；`mentionItems` 依赖 base + `mention.active/kind/query`
- FR-006：events.ts 导出 `isTransitionalAction(action)`（纯函数）；App.tsx onEvent 分流 `startTransition(() => dispatch(action))` / `dispatch(action)`

## 非目标

- 不做 delta 节流/合并（F1 选纯文本方案，非节流）
- 不改 markdown.tsx（高亮保留在 final 渲染）
- 不改 stream.ts reducer 结构（全局 tools 列表保留；F2 在渲染层隔离）
- 不引入 SWR 等缓存库

## 技术要点

- React Compiler 已启用（vite.client.config.ts babel preset）：组件级 memo 自动生成；F2 依赖 props 引用比较生效
- 引用稳定缓存：`toolsForBubble` 的 cache 是 `Map<bubbleId, rows>`，存 Chat 层 ref（每事件后新渲染时复用；bubble 删除的陈旧条目无碍——按 id 查询不存在即重建）
- 流式 text 块与 ▍ 同 span 显示（纯文本 + 光标）；`data-slot="step-text"` 保留（现有测试依赖）
- `isTransitionalAction` 放在 events.ts（与 toAction 同域，可单测）；类型为 `StreamAction["type"]` 判别
- startTransition 从 react 导入；App.tsx 薄接线层不做单测（events.ts 纯函数有测试）
