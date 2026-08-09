# TICKET-pi-web-R21-4：气泡底部间距

## 任务
MessageScrollerContent `px-4 py-3` → `px-4 pt-3 pb-8`（底边距 12px → 32px）。

## 文件
- `src/client/features/chat-stream/Chat.tsx`

## TDD
红：无（视觉）——浏览器冒烟验证
绿：一行类名改动
