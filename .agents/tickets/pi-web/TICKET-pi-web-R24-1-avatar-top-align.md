# TICKET-pi-web-R24-1-avatar-top-align

**迭代**：R24
**所属 User Story**：US1
**前置**：无
**状态**：open

## 任务

- `packages/pi-web/src/client/shared/ui/message.tsx`：MessageAvatar `self-end` → `self-start`（头像与气泡顶部对齐）

## TDD

- 红：`Chat.test.tsx`（+1：message-avatar className 含 self-start）
- 实现：message.tsx
- 验证：`npm test` + `npm run typecheck` 全绿

## 验收

- [ ] 测试全绿 / typecheck 0
- [ ] 冒烟：长回复气泡头像顶部对齐
