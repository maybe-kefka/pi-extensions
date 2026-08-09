# TICKET-pi-web-R25-2-web-ask-tools

**迭代**：R25 / **US**：US2（服务器端）/ **前置**：无

## 任务

- 新文件 `packages/pi-web/src/server/domain/web-ask.ts`：
  - 3 个工具定义（纯函数导出）：web_ask_single `{question, options[2..6]}` / web_ask_multi `{question, options[1..8], maxSelect?}` / web_ask_text `{question, placeholder?}`——name/label/description/promptSnippet/promptGuidelines/parameters(TypeBox)
  - pending registry：`registerPending(toolCallId) → {resolve, timer}`；`answerAsk(toolCallId, answer) → bool`（幂等）；`timeoutAsk(toolCallId)`（10 分钟）；`abortAsk(toolCallId)`；`serializeAnswer(...)`（结果 JSON 文本）
- `packages/pi-web/src/server/application/web-console.ts`（或 index.ts 接线）：`pi.registerTool` × 3——execute：校验参数 → registerPending → `await new Promise`（signal abort 监听）→ 返回 `{content:[{type:"text",text:serialize}]}`；`pi.on("before_agent_start")` 返回 systemPrompt 追加引导（遇到需澄清/决策问题优先用 web_ask_* 询问，不要猜测或继续）
- `packages/pi-web/src/server/interface/rpc-handler.ts`：case `web-ask:answer`——校验 toolCallId string / answer unknown → answerAsk → 未找到报 -32602
- 依赖：`npm i @sinclair/typebox -w @kefka/pi-web`（照 pi-notify-termux ^1.3.11）

## TDD

- 红：`web-ask.test.ts`（+4：register/answer 幂等 / 超时 resolve 未回答 / abort 取消 / serialize 格式）
- 实现 → `npm test` + typecheck

## 验收

- [ ] 测试全绿 / typecheck 0
- [ ] 冒烟（与 T3 一起）：LLM 调用 → 气泡问题卡片 → 回答 → LLM 继续
