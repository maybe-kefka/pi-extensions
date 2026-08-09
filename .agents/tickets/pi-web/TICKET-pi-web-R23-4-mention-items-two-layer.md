# TICKET-pi-web-R23-4-mention-items-two-layer

**迭代**：R23
**所属 User Story**：US4
**前置**：无
**状态**：open

## 任务

- `packages/pi-web/src/client/features/input-bar/InputBar.tsx` mentionItems 拆两层：
  - `baseFileItems` useMemo（依赖 `[files]`）：files 扁平化（id/label/insert/chip/group/isDir）
  - `baseSkillCommandItems` useMemo（依赖 `[skills, commands]`）：skill（insert `/skill:name`，chip）+ command（insert `/name`，非 chip）
  - `mentionItems` useMemo（依赖 `[mention.active, mention.kind, mention.query, baseFileItems, baseSkillCommandItems]`）：按 kind 选 base + `filterMentionItems(items, mention.query)`
- 行为不变：现有 @ 触发/过滤/空态测试全绿

## TDD

- 现有测试守护（InputBar.test.tsx +3 相关、mention.test.ts 全量）——重构无新行为；若发现可测边界可补（+0~1）
- 实现：`InputBar.tsx`
- 验证：`npm test`（全绿）+ `npm run typecheck`（0 error）

## 验收

- [ ] 测试全绿
- [ ] typecheck 0 error
- [ ] 冒烟：@ 菜单过滤行为不变
