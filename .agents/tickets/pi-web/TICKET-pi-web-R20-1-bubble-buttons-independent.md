# TICKET-pi-web-R20-1-bubble-buttons-independent

> **生命周期**：草稿在 `.scratch/R20/issues/`（gitignore）→ 完成后归档 `.agents/tickets/pi-web/TICKET-pi-web-R20-1-bubble-buttons-independent.md`。

**迭代**：R20
**所属 User Story**：US1（大 Turn 气泡与按钮独立）
**前置**：无
**状态**：open

## 任务

- `packages/pi-web/src/client/features/chat-stream/Chat.tsx`：`showToolbar` 从全局条件（`hasUser && !streaming && !agentStreaming`）改为 per-bubble：
  - 已完成气泡（`!bubbleStreaming(bubble)`）：fork + progress 按钮常驻
  - 活跃气泡（`bubbleStreaming(bubble)`）：只显示 progress 按钮（fork 仅完成态）
  - 去掉 `agentStreaming` 全局条件；`agentStreaming` prop 如不再使用则删除
- `Chat.tsx`：`TurnBubbleView` 增加按活跃/完成态区分的工具栏渲染

## TDD

- 先写失败测试：`packages/pi-web/src/client/features/chat-stream/Chat.test.tsx`（+2 测试，红）：
  - 两个气泡（第一个已完成、第二个流式中）→ 第一个气泡 fork/progress 可见，第二个气泡 progress 可见且 fork 不可见
- 实现：`Chat.tsx`
- 验证：`npm run test -w @kefka/pi-web`（全绿）+ `npm run typecheck`（0 error）

## 验收

- [ ] 测试全绿
- [ ] typecheck 0 error
- [ ] 冒烟：连续两个任务，第二个流式中第一个气泡按钮常驻、活跃气泡 progress 可见
