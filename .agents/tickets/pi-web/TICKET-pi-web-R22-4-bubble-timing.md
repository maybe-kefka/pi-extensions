# TICKET-pi-web-R22-4：turn_start 气泡时机

## 任务
stream.ts `turn_start` 创建空 turn（steps 空、final false、startedAt）；`message_start:assistant`
复用最后空 turn（steps 空 && text 空 && 未 final）。Chat.tsx StreamingSteps 空 steps 且 active → ▍。

## 文件
- `src/client/entities/chat/stream.ts`（+ test）
- `src/client/features/chat-stream/Chat.tsx`

## TDD
红：stream.test——turn_start 创建空 turn / message_start 复用
绿：实现 + Chat 测试 ▍
