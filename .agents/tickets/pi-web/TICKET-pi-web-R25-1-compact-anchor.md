# TICKET-pi-web-R25-1-compact-anchor

**迭代**：R25 / **US**：US1 / **前置**：无

## 任务

- `packages/pi-web/src/client/entities/chat/stream.ts`：StreamState.compacting 加 `anchorBubbleId: string | null`；session_before_compact 设最后气泡 id（`currentBubbleId` 或最后元素 id）；session_start 重置；initial null
- `packages/pi-web/src/client/features/chat-stream/Chat.tsx`：compact 记录从 map 尾部固定渲染改为锚定插入（bubbles.map 内 `b.id === compacting.anchorBubbleId` 后渲染；无 anchor 时渲染在流首）
- `packages/pi-web/src/server/interface/events.ts`：session_compact 映射补 `willRetry`（透传）

## TDD

- 红：`stream.test.ts`（+2：before_compact 记录 anchor；session_start 重置）+ `Chat.test.tsx`（+1：compact 记录在 anchor 气泡后）
- 实现 → `npm test` + typecheck

## 验收

- [ ] 测试全绿 / typecheck 0
- [ ] 冒烟：压缩记录固定位置，后续消息排其后
