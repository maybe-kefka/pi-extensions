# TICKET-pi-web-R25-5-progress-group

**迭代**：R25 / **US**：US4 / **前置**：无

## 任务

- `packages/pi-web/src/client/features/chat-stream/Chat.tsx` ProgressDialog：
  - entries 构造改为按 turn 分组：`Array<{turnIndex, steps}>`（跳过终态最后 turn 最后 text 块逻辑保留）
  - 每组：小 title「第 x 轮」（text-[11px] text-muted-foreground，data-slot=progress-turn-title）
  - content：无 label，Markdown 平铺
  - reasoning：无 label、不折叠——直接 text-xs text-muted-foreground pre（沿用 ReasoningBlock 展开区样式）；ReasoningBlock 组件若仅此一处使用则内联删除
  - tool：保持 ToolCard（默认折叠）
  - 删除顶层死代码 openReasoning/openTools/toggle（Chat.tsx:246-253）

## TDD

- 红：`Chat.test.tsx`（+1：progress 弹窗渲染「第 1 轮」title；reasoning 无折叠按钮直接灰字）
- 实现 → `npm test` + typecheck

## 验收

- [ ] 测试全绿 / typecheck 0
- [ ] 冒烟：弹窗每轮 title + reasoning 平铺灰字
