# TICKET-pi-web-R20-4-context-breakdown-real

> **生命周期**：草稿在 `.scratch/R20/issues/`（gitignore）→ 完成后归档 `.agents/tickets/pi-web/TICKET-pi-web-R20-4-context-breakdown-real.md`。

**迭代**：R20
**所属 User Story**：US5（上下文分类统计真实）
**前置**：无
**状态**：open

## 任务

根因：事件 ctx（`createContext()`）无 `getSystemPromptOptions`（仅特权命令 ctx 有）→ rpc-handler `?.()` 静默 undefined → 系统侧四类恒 0。

- `packages/pi-web/src/server/domain/context-breakdown.ts`（纯函数）：
  - 新增 `parseSystemPromptSections(systemPrompt: string): { contextFiles: number; tools: number; skills: number }`（token 估算）：
    - contextFiles：`<project_instructions path="...">...</project_instructions>` 段（含 path）
    - tools：`Available tools:` 到 `Guidelines:` 之间 `- name: snippet` 行
    - skills：`<available_skills>` 到 `</available_skills>` 段
    - 各段缺失 → 0（优雅降级，不抛错）
- `packages/pi-web/src/server/interface/rpc-handler.ts`（pi:getContextBreakdown）：
  - 优先特权：`console.privilegedCall(priv => ...)` 拿 `priv.getSystemPrompt()`（system 估算）+ `priv.getSystemPromptOptions()`（contextFiles/skills/toolSnippets 明细估算）
  - 特权失败（失效/未运行 /web）→ 降级事件 ctx：`ctx.getSystemPrompt()`（事件 ctx 有）估算 system + `parseSystemPromptSections` 解析明细
  - system = 完整系统提示词估算；total = system + conversation.total；明细（contextFiles/skills/tools）只展示不参与 total；ratio 语义相应调整（明细 ratio 可为空/基于自身分类语义，前端展示兼容）
  - conversation 保持 `ctx.sessionManager.buildContextEntries()`（现状）
- `packages/pi-web/src/client/entities/chat/types.ts` + `ContextPanel.tsx`：ContextBreakdownData 类型适配（明细不参与 total 的展示；total 文案"总占用 = 系统 + 对话"）

## TDD

- 先写失败测试：`packages/pi-web/src/server/domain/context-breakdown.test.ts`（+3 测试，红）：
  1. parseSystemPromptSections：真实系统提示词样本（含 project_instructions + Available tools + available_skills 三段）→ 三类非 0 且各自 > 0
  2. 无 contextFiles 段的提示词 → contextFiles = 0（不抛错）
  3. system 估算 = estimateTextTokens(全文)
- rpc-handler 分支属接线层（无单测，冒烟覆盖）
- 实现：context-breakdown.ts / rpc-handler.ts / types.ts / ContextPanel.tsx
- 验证：`npm run test -w @kefka/pi-web`（全绿）+ `npm run typecheck`（0 error）

## 验收

- [ ] 测试全绿
- [ ] typecheck 0 error
- [ ] 冒烟：RPC 会话（真实会话含 AGENTS.md）调 pi:getContextBreakdown → system/明细非 0；特权失效场景走降级不报错
