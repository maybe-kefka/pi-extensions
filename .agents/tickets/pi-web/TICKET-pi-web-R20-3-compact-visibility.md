# TICKET-pi-web-R20-3-compact-visibility

> **生命周期**：草稿在 `.scratch/R20/issues/`（gitignore）→ 完成后归档 `.agents/tickets/pi-web/TICKET-pi-web-R20-3-compact-visibility.md`。

**迭代**：R20
**所属 User Story**：US2（compact 过程可见）
**前置**：无
**状态**：open

## 任务

- `packages/pi-web/src/server/interface/events.ts`：mapEvent 增加 `session_before_compact`（fields: reason/willRetry/fromExtension，refreshState: true）
- `packages/pi-web/src/index.ts`：BROADCAST_EVENT_TYPES 增加 `session_before_compact`
- `packages/pi-web/src/client/entities/chat/stream.ts`：
  - StreamState 增加 `compacting: { phase: "before" | "done"; reason: string | null; willRetry: boolean } | null`
  - reducer case `session_before_compact` → `{ phase: "before", reason, willRetry }`
  - reducer case `session_compact` → `{ phase: "done", reason, willRetry }`（或并入系统记录）
  - `session_start` → 重置 compacting 为 null
- `packages/pi-web/src/client/features/chat-stream/Chat.tsx`（或 header 组件）：
  - `compacting.phase === "before"` → 顶部横幅"正在压缩上下文…（原因）"（header 常驻区或气泡流顶部固定条）
  - `phase === "done"` → 消息流插入**系统记录气泡**（居中灰字小卡片："上下文已压缩（原因：manual/threshold/overflow）"；willRetry 时追加"将重试上一条消息"）；该气泡为展示层生成（非持久，随会话切换清空）
- 系统记录气泡样式：非对话单元（居中、灰色、小字），不参与 fork/progress

## TDD

- 先写失败测试：`packages/pi-web/src/client/entities/chat/stream.test.ts`（+3 测试，红）：
  1. `session_before_compact` → compacting.phase = "before"
  2. `session_compact` → phase = "done"（reason 保留）
  3. `session_start` → compacting 重置 null
- 实现：events.ts / index.ts / stream.ts / Chat.tsx（或 header）
- 验证：`npm run test -w @kefka/pi-web`（全绿）+ `npm run typecheck`（0 error）

## 验收

- [ ] 测试全绿
- [ ] typecheck 0 error
- [ ] 冒烟：RPC 会话发 /compact → 横幅出现 → 完成 → 系统记录气泡出现
