# TICKET-pi-web-R20-2-tool-visibility-no-blank

> **生命周期**：草稿在 `.scratch/R20/issues/`（gitignore）→ 完成后归档 `.agents/tickets/pi-web/TICKET-pi-web-R20-2-tool-visibility-no-blank.md`。

**迭代**：R20
**所属 User Story**：US3 + US4（流式中工具可见 + 轮间无空白）
**前置**：无（与 TICKET-1 无依赖，可并行）
**状态**：open

## 任务

根因（实测事件序）：`message_end:assistant` 先于 `tool_execution_start` → message_end 立即 final 化 turn → tool_start 的块 id 填充分支被 `turn.final` 短路 → tool 块 toolCallId 恒空 → ToolCard 永不渲染；渲染层 final 且 text 空 → 空白。

- `packages/pi-web/src/client/entities/chat/stream.ts`：
  - `message_end`：turn 含 tool 块（`steps` 有 `type === "tool"` 或 `toolCallIds` 非空）时**不 final 化**（保留非 final，等待 turn_end）；仍重建 steps/更新 text/thinking（tool 块 id 来自 content 真实 id）
  - `turn_end`：现逻辑 final 化兜底（保持）——此时工具已执行完，tool 块 id 已被 tool_start 填充
  - `agent_end` / `agent_settled`：兜底 final 化所有非 final 的活跃 turn（中断/异常场景，避免悬挂）
  - `tool_start`：填充分支放宽——若无空 tool 块（`toolCallId === ""`），在活跃 turn steps 末尾追加 tool 块（防御 tool_execution_start 先于 toolcall_start 的交错顺序）
- `packages/pi-web/src/client/features/chat-stream/Chat.tsx` 渲染（问题 4）：
  - 活跃 turn steps 为空（新 turn 刚开始）→ 显示该气泡**最后一个有内容的 turn**（steps 非空）——原子切换，无空白帧
  - 终态（无活跃 turn）：最后 turn text 非空 → Markdown（不变）；最后 turn 是工具轮（text 空但 steps 有内容）→ 显示 StreamingSteps（工具卡片 done 态）——极端中断场景不白屏
  - 新增/调整测试断言（tool 卡片在 message_end 后、tool_execution_start 前的间隙可见）

## TDD

- 先写失败测试：`packages/pi-web/src/client/entities/chat/stream.test.ts`（+3 测试，红）：
  1. 事件序 `message_end`（含 tool 块）→ `tool_start` → `turn_end`：tool 块 id 被填充（非空）、turn 在 turn_end 才 final
  2. `agent_end` 兜底：非 final turn 被 final 化
  3. `tool_start` 无空块时追加块
- `packages/pi-web/src/client/features/chat-stream/Chat.test.tsx`（+2 测试，红）：
  4. 新 turn steps 空时显示上一轮内容（无空白）
  5. 终态工具轮显示工具卡片（done 态）
- 实现：`stream.ts` + `Chat.tsx`
- 验证：`npm run test -w @kefka/pi-web`（全绿）+ `npm run typecheck`（0 error）

## 验收

- [ ] 测试全绿（含 202 原测试无回归）
- [ ] typecheck 0 error
- [ ] 冒烟：read 文件任务——流式中工具卡片出现（running→done）、工具完成到下一轮 reasoning 之间无空白、终态只留最终回复
