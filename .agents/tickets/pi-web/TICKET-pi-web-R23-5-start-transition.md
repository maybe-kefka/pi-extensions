# TICKET-pi-web-R23-5-start-transition

**迭代**：R23
**所属 User Story**：US5
**前置**：无
**状态**：open

## 任务

- `packages/pi-web/src/client/entities/chat/events.ts`：导出纯函数 `isTransitionalAction(type: StreamAction["type"]): boolean`——`text_delta` / `thinking_delta` / `tool_update` 为 true，其余 false
- `packages/pi-web/src/client/app/App.tsx` onEvent：`const action = toAction(evt)`；`isTransitionalAction(action.type) ? startTransition(() => dispatch(action)) : dispatch(action)`；`startTransition` 从 react 导入

## TDD

- 先写失败测试：`events.test.ts`（+2：三类高频事件 true；消息边界/conn/history 等 false，红）
- 实现：`events.ts` + `App.tsx`
- 验证：`npm test`（全绿）+ `npm run typecheck`（0 error）

## 验收

- [ ] 测试全绿
- [ ] typecheck 0 error
- [ ] 冒烟：流式正常 + 自动滚动正常
