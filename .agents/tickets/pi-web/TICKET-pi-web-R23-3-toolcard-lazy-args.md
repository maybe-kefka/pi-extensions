# TICKET-pi-web-R23-3-toolcard-lazy-args

**迭代**：R23
**所属 User Story**：US3
**前置**：TICKET-pi-web-R23-2（改同一区域，先后顺序）
**状态**：open

## 任务

- `Chat.tsx` ToolCard：`argsJson` 用 `useMemo(() => row.args == null ? "" : JSON.stringify(row.args), [row.args])`；preview = `row.output.trim() || argsJson`
- 展开区 `JSON.stringify(row.args, null, 2)` 仅 `open` 时渲染（现状已惰性，保持）；展开态大 args 序列化也包 useMemo（`argsJsonPretty`，依赖 `[row.args]`）

## TDD

- 先写失败测试：`Chat.test.tsx`（+1：大 args 折叠态 preview 截断/不含完整 JSON；展开态含完整 JSON，红）
- 实现：`Chat.tsx` ToolCard
- 验证：`npm test`（全绿）+ `npm run typecheck`（0 error）

## 验收

- [ ] 测试全绿
- [ ] typecheck 0 error
- [ ] 冒烟：工具卡片折叠/展开正常
