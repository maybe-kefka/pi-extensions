# TICKET-pi-web-R25-3-web-ask-frontend

**迭代**：R25 / **US**：US2（前端）/ **前置**：R25-2

## 任务

- `packages/pi-web/src/client/features/chat-stream/Chat.tsx`：
  - 新组件 WebAskCard（或 ToolCard 分支）：row.toolName 为 web_ask_* 时渲染交互卡片——data-slot=web-ask
    - web_ask_single：问题文本 + 单选选项组（radio 样式按钮）
    - web_ask_multi：问题 + checkbox 组（maxSelect 限制）
    - web_ask_text：问题 + textarea + 提交
    - 已回答（row.output 非空）→ 显示回答结果文本（非交互）
    - 提交 → `rpc.request("web-ask:answer", {toolCallId, answer})`
  - rpc 句柄经 props 传入（避免组件内新建连接）

## TDD

- 红：`Chat.test.tsx`（+2：web_ask 工具渲染问题卡片（含选项）；提交调用 rpc）
- 实现 → `npm test` + typecheck

## 验收

- [ ] 测试全绿 / typecheck 0
- [ ] 冒烟：问题卡片渲染/回答/LLM 继续（与 T2 一起）
