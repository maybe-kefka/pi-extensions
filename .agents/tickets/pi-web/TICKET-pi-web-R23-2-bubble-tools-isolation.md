# TICKET-pi-web-R23-2-bubble-tools-isolation

**迭代**：R23
**所属 User Story**：US2
**前置**：无
**状态**：open

## 任务

- 新文件 `packages/pi-web/src/client/features/chat-stream/tools-for-bubble.ts`：纯函数 `toolsForBubble(bubble, rows, cache)`——按 `bubbleToolCallIds(bubble)` 过滤；若过滤结果与缓存元素引用全同 → 返回缓存数组（引用稳定）；否则更新缓存
- `Chat.tsx`：`const rowsCacheRef = useRef(new Map<string, ToolRow[]>())`；每气泡 `<TurnBubbleView bubble={b} rows={toolsForBubble(b, state.tools, cache)} />`；TurnBubbleView props 从 `tools: StreamState["tools"]` 改为 `rows: ToolRow[]`（ProgressDialog 同样）；内部 rows Map 构建直接基于传入 rows
- 依赖 React Compiler props 引用比较：历史气泡（bubble 引用未变 + rows 引用稳定）在 text_delta 流式中不重渲染

## TDD

- 先写失败测试：`tools-for-bubble.test.ts`（+3：相关行过滤；元素引用未变返回缓存数组；行更新后新数组，红）
- 实现：`tools-for-bubble.ts` + `Chat.tsx` 接线
- 验证：`npm test`（全绿）+ `npm run typecheck`（0 error）

## 验收

- [ ] 测试全绿
- [ ] typecheck 0 error
- [ ] 冒烟：工具流式时历史气泡不重渲染（React DevTools / 渲染计数）
