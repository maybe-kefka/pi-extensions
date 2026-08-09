# TICKET-pi-web-R24-2-bottom-space-25vh

**迭代**：R24
**所属 User Story**：US2
**前置**：无
**状态**：open

## 任务

- `packages/pi-web/src/client/features/chat-stream/Chat.tsx`：MessageScrollerContent `pb-8` → `pb-[25vh]`

## TDD

- 红：`Chat.test.tsx`（+1：内容容器 className 含 pb-[25vh]）
- 实现：Chat.tsx
- 验证：`npm test` + `npm run typecheck` 全绿

## 验收

- [ ] 测试全绿 / typecheck 0
- [ ] 冒烟：滚动到底最后消息距输入框 ≈ 25vh
