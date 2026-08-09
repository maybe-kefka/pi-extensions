# TICKET-pi-web-R23-1-streaming-plain-text

**迭代**：R23
**所属 User Story**：US1
**前置**：无
**状态**：open

## 任务

- `packages/pi-web/src/client/features/chat-stream/Chat.tsx` StreamingSteps 的 text 块分支：`active` → 纯文本 span（`wrap-break-word whitespace-pre-wrap`）+ ▍（仅最后 text 块且 active）；`active=false` → 保持 `<Markdown text={st.text}>`
- `data-slot="step-text"` 结构保留（现有测试依赖）

## TDD

- 先写失败测试：`Chat.test.tsx`（+2：流式中 text 块为纯文本无 markdown-body；终态工具轮 active=false 为 Markdown，红）
- 实现：`Chat.tsx` StreamingSteps text 块
- 验证：`npm test`（全绿）+ `npm run typecheck`（0 error）

## 验收

- [ ] 测试全绿
- [ ] typecheck 0 error
- [ ] 冒烟：流式中纯文本、终态 Markdown
