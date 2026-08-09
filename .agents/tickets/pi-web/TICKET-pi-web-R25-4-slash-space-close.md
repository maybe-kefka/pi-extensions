# TICKET-pi-web-R25-4-slash-space-close

**迭代**：R25 / **US**：US3 / **前置**：无

## 任务

- `packages/pi-web/src/client/features/input-bar/mention.ts`：激活态（active && kind）按空格 → 关闭面板（新纯函数 `mentionCommit` 或扩展 resetMention：query 清空、prevWasSpace 清、active=false）——注意与 Backspace 逻辑区分
- `packages/pi-web/src/client/features/input-bar/InputBar.tsx`：keydown 分支：激活态空格不再累积进 query，改调关闭
- 文本保留：关闭只动 mention 状态，不动编辑器内容

## TDD

- 红：`mention.test.ts`（+2：激活态空格关闭（active=false, query="", prevWasSpace=false）；关闭后可重新触发 /）
- 实现 → `npm test` + typecheck

## 验收

- [ ] 测试全绿 / typecheck 0
- [ ] 冒烟：`/abc ` 面板消失、文本保留
