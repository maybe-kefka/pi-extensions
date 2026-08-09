# TICKET-pi-web-R25-7-send-steer

**迭代**：R25 / **US**：US7 / **前置**：无

## 任务

- `packages/pi-web/src/client/app/App.tsx`：send 改为 `c.request("pi:sendMessage", { text, deliverAs: "steer" })`

## TDD

- 无新单测（集成路径）；typecheck + 全量测试守护
- 验证：`npm test` + typecheck

## 验收

- [ ] 测试全绿 / typecheck 0
- [ ] 冒烟：LLM 输出时追加消息不报错，输出结束后自动处理
