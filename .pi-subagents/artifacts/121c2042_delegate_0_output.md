# STANDARDS-axis review — @kefka/pi-status (T0..T10)

Reviewed full diff (empty tree → HEAD), SPEC.md, both tsconfigs, all 6 src modules, 5 test files, per-commit history, and verified against `@earendil-works/pi-coding-agent`/`pi-tui` type defs.

## Documented-standard compliance (SPEC.md §7, §2.1, §4, §5)
- **index.ts is a thin wiring layer** ✓ — pulls API data, delegates to pure modules, dispatches TUI/notify. No business logic; `normalizeUsagePercent` at the boundary is SPEC §3-mandated. No `index.test.ts` ✓.
- **All other src modules pure + unit-tested (TDD)** ✓ — context/format/resources/mcp-config all tested; widget.ts has module-snapshot state but that's SPEC §2.1-mandated (`setStatusData` design) and tested.
- **`import type` everywhere required** ✓ (index/widget/resources/tests) — also enforced by `verbatimModuleSyntax`; typecheck green → skipped per brief.
- **§4 token accounting** ✓ — `chars/4` with `Math.ceil`, percent normalized 0-100→0-1 exactly once (T7 double-multiply fix verified), ratios denominator = 5-category total.
- **§5 YAML blocks** ✓ — `renderYamlList` header + `  - item`, empty→`(0)` header, plugin counts, mcp `(disabled)` + `~`-abbreviated source, config priority order, dedupe-first-source.
- **§6 edge cases** ✓ — 待更新/`--`, empty session, malformed config skip, non-TUI notify.

## Smells / judgement calls
1. **SPEC self-conflict (doc drift, not a code violation)**: §1.2 non-goals still say "不用 widget（面板超 widget 10 行上限）" and "v1 用对话内条目（appendEntry）", contradicting §2.1's widget-final design that T9/T10 implement. Code follows §2.1 (operative); §1.2 is stale.
2. **Auto-collapse undocumented in SPEC §2.1** — "不做折叠态/面板固定在屏幕上" vs. index.ts:20-26 `pi.on("input")` dismissal. Documented only in TICKETS.md:90. Dismissal ≠ collapse-state, so no hard breach. The claim "`/status` 本身不触发 input" (index.ts:18) is behaviorally untestable — index.ts has no tests by design; residual risk.
3. **Data Clumps** — format.ts:199-201: `ratio: data.ratios[c.key] ?? 0` — category {key,label,tokens} and its ratio live in two structures; the `?? 0` fallback exists only because of the split. Bundle ratio into the category entry.
4. **Duplicated Code (mild)** — context.ts `contentChars` vs. the assistant branch in `estimateMessageTokens` both iterate content blocks summing text lengths (different block types, partial shape overlap).
5. **Middle Man (mild)** — `buildPanelLines` (format.ts:236-238) just maps `buildPanelRows`; used only by tests; not in SPEC §7's list.
6. **Purity stretch** — format.ts `mcpItemLabels` calls `homedir()` (node:os) though SPEC §7 calls format.ts "纯函数"; mcp-config.ts avoided this by taking `homeDir` as param. Inconsistent testability choice.
7. **Mysterious Name (mild)** — `renderStatusWidget` is a factory returning a Component; `STATUS_WIDGET_KEY` doubles as the footer-status key (index.ts:74) — dual use not revealed by name.
8. **Boundary quirk (not SPEC'd)** — `formatCompact(999999)` → `"1000k"` (rounds past the k/M boundary; no M fallback). Untested edge.

No Repeated Switches, Feature Envy, Shotgun Surgery, or Speculative Generality found.

## Acceptance report