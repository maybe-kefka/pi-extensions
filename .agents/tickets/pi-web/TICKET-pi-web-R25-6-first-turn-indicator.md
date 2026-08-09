# TICKET-pi-web-R25-6-first-turn-indicator

**迭代**：R25 / **US**：US5+US6 / **前置**：无

## 任务

- `packages/pi-web/src/client/entities/chat/stream.ts`：
  - turn_start：`processingToolResult === null` → 设 ""（不覆盖既有窗口期）
  - thinking_delta：**移除** processingToolResult 更新逻辑（R24 遗留，Q8 撤销）
- `packages/pi-web/src/client/features/chat-stream/Chat.tsx`：
  - StreamingSteps：移除 processing prop 及 thinking 块隐藏逻辑（thinking 块始终渲染）
  - 指示器文本恒定 "thinking......"（`processing || "thinking......"` 现有逻辑保留即可——processing 恒 ""）
  - ▍（working-caret）条件加 `!processing`（R22 空 turn 指示器在窗口期隐藏）
  - step-thinking：ref + useEffect（thinking 文本变化且 active → scrollTop = scrollHeight）

## TDD

- 红（改写 R24 断言）：`stream.test.ts`（-1 改：thinking_delta 不再更新 processingToolResult；+1：turn_start 空 processing 设 ""；工具轮后 turn_start 不覆盖）+ `Chat.test.tsx`（改写：thinking 块窗口期正常渲染；指示器恒占位；▍ 隐藏；滚动跟随）
- 实现 → `npm test` + typecheck

## 验收

- [ ] 测试全绿 / typecheck 0
- [ ] 冒烟：发送后 spinner+thinking......；thinking 滚动区出现且自动跟随；tool_end 窗口指示器仍正常
