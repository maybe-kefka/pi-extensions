# TICKET-pi-web-R24-3-thinking-4-lines

**迭代**：R24
**所属 User Story**：US3
**前置**：无
**状态**：open

## 任务

- `packages/pi-web/src/client/features/chat-stream/Chat.tsx`：StreamingSteps step-thinking 块加 `max-h-16 overflow-y-auto scrollbar-thin`（4 行窗口，全文可滚）

## TDD

- 红：`Chat.test.tsx`（+1：超长 thinking 时 step-thinking 块含 max-h-16/overflow-y-auto）
- 实现：Chat.tsx
- 验证：`npm test` + `npm run typecheck` 全绿

## 验收

- [ ] 测试全绿 / typecheck 0
- [ ] 冒烟：超 4 行 thinking 出现滚动条
