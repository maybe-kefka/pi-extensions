# SPEC-axis review — @kefka/pi-status (T0..T10, HEAD ae10472)

## (a) Missing / partial requirements

1. **MCP tool counts never computed** — SPEC §5.3: "`  - github (5 tools) [~/.agents/mcp.json]`…工具数 = 该来源下 `getAllTools()` 中属于 pi-mcp-adapter 插件且名称以服务器名前缀开头的工具数". `mcpItemLabels` (format.ts:196) renders only `name [source]`; index.ts never maps tools→servers; no test. The "无法判定时为 0" escape doesn't excuse pi-mcp-adapter, where it IS determinable.
2. **Custom messages excluded from 对话合计** — SPEC §4.1: "custom / branchSummary / compactionSummary 归入对话合计但不单独列行". `contextMessagesFromEntries` (context.ts:31) keeps only message/compaction/branch_summary; pi's `sessionEntryToContextMessages` also emits role-`custom` from custom_message entries. Tests codify the skip (context.test.ts:157), so `conversation.other` is always 0 in practice.
3. **Message source deviates from spec** — SPEC §3: "对话消息列表 | `ctx.sessionManager.buildSessionContext()`". index.ts:52 uses `buildContextEntries()` + a hand-rolled partial re-projection instead of the spec-named resolved-message API.
4. **`tokens===null` row** — SPEC §6: "已用: 待更新，percent 显示 `--`"; renderOverviewLine (format.ts:139) shows no percent at all.
5. **System-text join** — SPEC §4.1 "customPrompt + promptGuidelines（以 `\n` 连接）+ appendSystemPrompt"; context.ts:158-160 joins the three parts with `""` (only guidelines get `\n`), slightly under-counting.

## (b) Scope creep / not asked for

- **Auto-collapse (T10) absent from SPEC**; contradicts SPEC §2.1 "面板固定在屏幕上，每次更新即时可见" and "恒渲染全量面板…不做折叠态" — SPEC↔TICKETS inconsistency (TICKETS T10 also re-pastes T9's acceptance block verbatim).
- `command.source !== "extension"` filter (resources.ts:63) — undocumented; SPEC §5.2 only says dedup by `sourceInfo.source`.
- Placeholder widget hint (widget.ts:45), README.md, `package.json` missing `"private": true` (SPEC §1.2: not published) — minor.

## (c) Implemented but wrong/risky

- **Widget 10-line cap bypass** — SPEC §1.2: "不用 widget（面板超 widget 10 行上限）" vs §2.1 mandates widget (SPEC self-contradiction). `MAX_WIDGET_LINES=10` (interactive-mode.js:1548) only clips the string-array overload; the factory overload renders 16+ unclipped lines — verified Container.render concatenates all child lines — defeating the documented viewport-overflow guard.
- Collapse ordering is correct: pi runs extension commands before `emitInput` (agent-session.js:808-816), so `/status` won't self-collapse. However the footer `setStatus` is never cleared on collapse (stale feedback persists).
- `percent` 0-100→0-1 normalization (SPEC §3) and 65 tests = 14+34+10+4+3 (TICKETS T9/T10 claim ✓) check out.

## Acceptance report

No files modified (read-only review agent).