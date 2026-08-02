All evidence gathered. I've verified the full diff, all source/test files, and pi's actual API behavior (widget truncation, input event ordering, ContextUsage percent semantics, session entry shapes).

---

# SPEC-axis review — @kefka/pi-status (T0..T10, diff vs empty tree)

**(a) Missing / partial requirements**

1. **MCP tool counts never implemented.** SPEC §5.3: "格式：`mcps (2):` + `  - github (5 tools) [~/.agents/mcp.json]` 逐项列出（`mcpItemLabels`）；工具数 = 该来源下 `getAllTools()` 中属于 pi-mcp-adapter 插件且名称以服务器名前缀开头的工具数；无法判定时为 0 并省略 `(N tools)`". `mcpItemLabels` (format.ts) only emits `name [source]` (+`(disabled)`); `McpServerConfig` has no tools field; `summarizeResources` never counts MCP tools. The code permanently takes the "无法判定" branch.
2. **Overview percent `--` omitted.** SPEC §6: "`tokens === null` → 总览行 `已用: 待更新`，percent 显示 `--`" and "模型无 contextWindow → 窗口显示 `--`，percent `--`". `renderOverviewLine` drops the percent field entirely in both cases (test asserts `已用: 待更新` with no `(--)`).
3. **Spec'd data source unused.** SPEC §3: 对话消息 from `ctx.sessionManager.buildSessionContext()`. index.ts uses `buildContextEntries()` + hand-rolled `contextMessagesFromEntries`. Token math matches pi's own `estimateTokens` (verified in compaction.js) so it's near-equivalent, but the spec'd API is not used.
4. **Auto-collapse (TICKETS T10) works but is absent from SPEC.md.** Confirmed against docs: `input` fires after extension-command dispatch, so `/status` never self-collapses; `{action:"continue"}` is valid. But SPEC §2.1 still says "不做折叠态" / "面板固定在屏幕上", directly contradicting the collapse; T10's commit claims "SPEC updated" yet only §5.1–5.3 changed.
5. **SPEC §1.2 vs §2.1 contradiction.** §1.2 non-goals still mandate `appendEntry`+`registerEntryRenderer` and forbid widgets ("面板超 widget 10 行上限") — stale vs §2.1's widget mandate. Nuance: pi truncates only *string-array* widgets at `MAX_WIDGET_LINES=10`; the factory/component form used here bypasses truncation, so the 20-line panel renders.
6. **TICKETS.md T10** ends with a verbatim duplicate of T9's acceptance block.

**(b) Scope creep** — placeholder hint `[status] 运行 /status…` when no snapshot (widget.ts; unspecified, benign); image blocks at 4800 chars (matches pi's constant, implied by §1.3 "同口径"). Nothing material.

**(c) Implemented but wrong**
1. `formatCompact` k-case: SPEC §4.3 "≥ 1000 → `Math.round(n/1000)k`" (integer); impl emits one-decimal (`1500 → "1.5k"` vs spec "2k").
2. §4.1 "以 `\n` 连接": impl joins the three system-prompt parts with `""` (guidelines \n-joined only) — ambiguous spec, tests lock it in.
3. Module `currentData` snapshot never cleared (stale across sessions/reloads); footer not cleared on input-collapse — unspecified, low risk.