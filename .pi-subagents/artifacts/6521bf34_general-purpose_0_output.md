# STANDARDS-axis review — @kefka/pi-status (T0..T10)

Reviewed full diff (empty-tree→HEAD), SPEC.md, both tsconfigs, all src/test files, and per-commit history. `tsc --noEmit` passes; tests not re-run (read-only review).

## A. Documented-standard deviations

1. **HARD — SPEC §1.2 contradicts §2.1 and the code.** §1.2 (SPEC.md:12) still states v1 "用对话内条目（`appendEntry` + `registerEntryRenderer`）…也不用 widget（面板超 widget 10 行上限）", but T9/T10 implemented exactly the widget approach (`ctx.ui.setWidget`, index.ts:19, 63) and §2.1 (SPEC.md:28-39) was rewritten to it. T9's message claims a return to "SPEC 原始设计" but §1.2's non-goal was left stale. §1.3 (SPEC.md:18) also still says pi-tui is "entry-renderer 用" — entry-renderer.ts was deleted in T9.
2. **Judgement — T10 auto-collapse is undocumented.** index.ts:22-28 (`pi.on("input")` → `setWidget(key, undefined)`) is absent from SPEC: grep for 折叠/collapse/input finds only §2.1's "不做折叠态" (panel render state, not dismissal). T10's commit claims "SPEC/TICKETS updated" but its SPEC diff only touched §5. The brief's premise that §2.1 documents auto-collapse is inaccurate.
3. **Judgement — §5.3 mcp `(N tools)` never implemented.** SPEC.md:119 specifies per-server tool counts (pi-mcp-adapter prefix match); `mcpItemLabels` (format.ts:135-141) always renders `name [src]` — no counting logic anywhere (resources.ts, index.ts pass no tools). SPEC's "无法判定时…省略" clause makes this deviation-by-omission, not wrong output.
4. **Judgement — §3 data source.** SPEC.md:36 names `sessionManager.buildSessionContext()`; index.ts:40 uses `buildContextEntries()` + `contextMessagesFromEntries` (context.ts:24-38, rationale documented in-code: excludes custom/status entries).
5. **Judgement — §4.3 window rounding.** SPEC says `Math.round(n/1000)`; `formatCompact` (format.ts:15-24) uses `trimDecimal` (1-decimal), e.g. 15,250 → "15.3k" vs SPEC "15k".

## B. Baseline smells (judgement calls)

- **Duplicated Code** — `renderBarRow`/`renderTotalLine` (format.ts:98-114) share the identical label-width + token-column layout; extract one column helper.
- **Repeated Switches** — the `message.role` cascade recurs in `estimateMessageTokens` (context.ts:90-128) and the conversation bucket loop (context.ts:162-172); a shared role→(chars|bucket) map would serve both.
- **Duplicated Code (minor)** — `contentChars` (context.ts:80-88) and the assistant branch (context.ts:100-111) duplicate the block/text iteration.
- **Data Clumps** — `PanelData.categories: {key,label,tokens}[]` (format.ts:151) re-declares `ContextCategory` (context.ts:26-30) instead of importing the type.

## C. Conformance (clean)

`import type`/verbatimModuleSyntax ✓; index.ts thin + untested ✓ (§7); all pure modules unit-tested (65 tests, 5 files, no index.test) ✓; runtime dep only pi-tui ✓; §2.1 widget-key replacement + §6 notify format ✓; §5.1/5.2 YAML blocks ✓.

## Acceptance report