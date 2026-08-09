# TICKET-pi-web-R24-4-scrollbar-unify

**迭代**：R24
**所属 User Story**：US4
**前置**：无
**状态**：open

## 任务

- `packages/pi-web/src/client/features/sessions/SessionList.tsx`：`ScrollArea` 替换为原生 div（`scrollbar-thin scrollbar-gutter-stable`，保留 h-40 结构）
- `packages/pi-web/src/client/features/sessions/TreeDialog.tsx`：同上（h-[50vh]）
- `packages/pi-web/src/client/features/sessions/Sidebar.tsx`：aside + 抽屉 div 补 `scrollbar-thin scrollbar-gutter-stable`
- `packages/pi-web/src/client/features/chat-stream/Chat.tsx` ProgressDialog：`overflow-y-auto` 补 `scrollbar-thin scrollbar-gutter-stable`
- `packages/pi-web/src/client/features/input-bar/MentionMenu.tsx`：补 `scrollbar-thin`
- `packages/pi-web/src/client/features/input-bar/InputBar.tsx` 编辑器：补 `scrollbar-thin scrollbar-gutter-stable`
- `packages/pi-web/src/client/shared/ui/select.tsx`：Radix 弹出层补 `scrollbar-thin`
- 删除 `packages/pi-web/src/client/shared/ui/scroll-area.tsx`（无使用点后）

## TDD

- 现有测试守护（无新行为）；grep 验证无 ScrollArea 残留
- 验证：`npm test` + `npm run typecheck` 全绿

## 验收

- [ ] 测试全绿 / typecheck 0
- [ ] grep "ScrollArea" 无 src/client 命中
- [ ] 冒烟：会话列表/树弹窗滚动条与聊天流一致
