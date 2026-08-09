# TICKET-pi-web-R24-5-tool-result-window

**迭代**：R24
**所属 User Story**：US5
**前置**：无
**状态**：open

## 任务

- `packages/pi-web/src/client/entities/chat/stream.ts`：`processingToolResult: string | null`（initial null）
  - tool_end → `""`（窗口期开始）
  - message_update thinking_delta 且 processingToolResult 非 null → 更新为 thinking 内容
  - message_update text_delta → `null`（窗口期结束）
  - agent_end / agent_settled → `null`
  - history / session_start → `null`
- `packages/pi-web/src/client/features/chat-stream/Chat.tsx`：
  - TurnBubbleView 收 `processing: string | null`（Chat map 时仅最后气泡传 state.processingToolResult）
  - Bubble 内容区第一行指示器：`[data-slot=tool-processing]` = Loader2 spinner + `processing || "thinking......"`
  - StreamingSteps 收 `processing?: boolean`——thinking 块渲染条件 `st.text.trim() && !processing`

## TDD

- 红：`stream.test.ts`（+4：tool_end 设置 "" / thinking_delta 更新 / text_delta 清除 / agent_end 清除）+ `Chat.test.tsx`（+2：窗口期指示器渲染、thinking 块隐藏；text_delta 后指示器消失）
- 实现：stream.ts + Chat.tsx
- 验证：`npm test` + `npm run typecheck` 全绿

## 验收

- [ ] 测试全绿 / typecheck 0
- [ ] 冒烟：工具完成后 spinner + thinking...... → thinking 更新 → text 流式后消失
