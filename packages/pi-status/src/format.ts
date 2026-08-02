/**
 * Pure formatting helpers for the /status panel.
 * All functions are side-effect free and unit-tested.
 */

import { homedir } from "node:os";

/** Format a token count with thousands separators. */
export function formatTokens(n: number): string {
	return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Compact display: 128000 -> "128k", 2.5e6 -> "2.5M" (k: SPEC §4.3 Math.round). */
export function formatCompact(n: number): string {
	if (n >= 1_000_000) {
		return `${trimDecimal(n / 1_000_000)}M`;
	}
	if (n >= 1000) {
		return `${Math.round(n / 1000)}k`;
	}
	return String(n);
}

function trimDecimal(x: number): string {
	return String(Math.round(x * 10) / 10);
}

/** Percent with one decimal, or "--" when unknown. */
export function formatPercent(ratio: number | null): string {
	if (ratio === null || !Number.isFinite(ratio)) return "--";
	return `${(ratio * 100).toFixed(1)}%`;
}

/**
 * Convert getContextUsage().percent (already a 0-100 percentage) to a 0-1
 * ratio for the pure formatting layer. Null passes through.
 */
export function normalizeUsagePercent(percent: number | null): number | null {
	return percent === null ? null : percent / 100;
}

/** ASCII bar of `width` cells; ratio clamped to [0, 1]. */
export function bar(ratio: number, width = 10): string {
	const clamped = Math.max(0, Math.min(1, ratio));
	const filled = Math.round(clamped * width);
	return "█".repeat(filled) + "░".repeat(width - filled);
}

/** Display width: ASCII 1, CJK/wide chars 2. */
export function displayWidth(s: string): number {
	let w = 0;
	for (const ch of s) {
		w += isWide(ch) ? 2 : 1;
	}
	return w;
}

function isWide(ch: string): boolean {
	const code = ch.codePointAt(0) ?? 0;
	return (
		(code >= 0x1100 && code <= 0x115f) || // Hangul Jamo
		(code >= 0x2e80 && code <= 0xa4cf) || // CJK, Kangxi, Yi
		(code >= 0xac00 && code <= 0xd7a3) || // Hangul syllables
		(code >= 0xf900 && code <= 0xfaff) || // CJK compat ideographs
		(code >= 0xfe30 && code <= 0xfe4f) || // CJK compat forms
		(code >= 0xff00 && code <= 0xff60) || // Fullwidth forms
		(code >= 0xffe0 && code <= 0xffe6) ||
		(code >= 0x1f300 && code <= 0x1faff) // Emoji
	);
}

/** Pad a string to a display width (CJK-aware). Never truncates. */
export function padDisplay(s: string, width: number): string {
	const w = displayWidth(s);
	return w >= width ? s : s + " ".repeat(width - w);
}

export interface BarRowOptions {
	label: string;
	tokens: number;
	ratio: number;
	/** Minimum label display width; defaults to label width + 2. */
	labelWidth?: number;
}

const TOKEN_COL_WIDTH = 7;
const PERCENT_COL_WIDTH = 6;

/** Render one bar row: `<label> <tokens> <bar> <percent>`. */
export function renderBarRow(opts: BarRowOptions): string {
	const minWidth = displayWidth(opts.label) + 2;
	const labelWidth = Math.max(opts.labelWidth ?? minWidth, minWidth);
	const label = padDisplay(opts.label, labelWidth);
	const tokens = formatTokens(opts.tokens).padStart(TOKEN_COL_WIDTH);
	return `${label}${tokens} ${bar(opts.ratio)} ${formatPercent(opts.ratio).padStart(PERCENT_COL_WIDTH)}`;
}

/** Render a non-bar total line: `<label> <tokens> [note]`. */
export function renderTotalLine(label: string, tokens: number, note?: string, labelWidth?: number): string {
	const minWidth = displayWidth(label) + 2;
	const width = Math.max(labelWidth ?? minWidth, minWidth);
	const l = padDisplay(label, width);
	const t = formatTokens(tokens).padStart(TOKEN_COL_WIDTH);
	const suffix = note ? ` ${note}` : "";
	return `${l}${t}${suffix}`;
}

export interface OverviewLineOptions {
	model: string;
	contextWindow: number | null;
	tokens: number | null;
	/** Context usage as a 0-1 ratio (NOT the 0-100 percentage from getContextUsage()). */
	percent: number | null;
}

/**
 * Render the overview line: `<model> | 窗口: <window> | 已用: <tokens> (<percent>)`.
 * SPEC §6: percent shows "(--)" when tokens are unknown (post-compaction) or
 * when the context window is unknown.
 */
export function renderOverviewLine(opts: OverviewLineOptions): string {
	const window_ = opts.contextWindow && opts.contextWindow > 0 ? formatCompact(opts.contextWindow) : "--";
	const percentText = opts.percent !== null ? ` (${formatPercent(opts.percent)})` : " (--)";
	let used: string;
	if (opts.tokens === null) {
		used = "待更新";
	} else {
		used = `${formatTokens(opts.tokens)} tokens`;
	}
	return `${opts.model} | 窗口: ${window_} | 已用: ${used}${percentText}`;
}

/**
 * YAML-style block: `header` followed by `  - item` lines.
 * Empty item list renders just the header (e.g. `skills (0)`).
 */
export function renderYamlList(header: string, items: string[]): string[] {
	if (items.length === 0) return [header];
	return [header, ...items.map((item) => `  - ${item}`)];
}

/** Per-plugin item labels (tool/command counts, zero omitted). */
export function pluginItemLabels(plugins: Array<{ display: string; tools: number; commands: number }>): string[] {
	return plugins.map((p) => {
		const bits: string[] = [];
		if (p.tools > 0) bits.push(`${p.tools} ${p.tools === 1 ? "tool" : "tools"}`);
		if (p.commands > 0) bits.push(`${p.commands} ${p.commands === 1 ? "cmd" : "cmds"}`);
		return bits.length > 0 ? `${p.display} (${bits.join(", ")})` : p.display;
	});
}

/** Per-mcp item labels: `name (N tools) [src]` (tools omitted when 0/unknown). */
export function mcpItemLabels(mcps: Array<{ name: string; source: string; disabled: boolean; tools?: number }>): string[] {
	const home = homedir();
	return mcps.map((m) => {
		const src = m.source.startsWith(home) ? `~${m.source.slice(home.length)}` : m.source;
		const flag = m.disabled ? " (disabled)" : "";
		const tools = m.tools && m.tools > 0 ? ` (${m.tools} ${m.tools === 1 ? "tool" : "tools"})` : "";
		return `${m.name}${flag}${tools} [${src}]`;
	});
}

export interface PanelData {
	overview: OverviewLineOptions;
	categories: Array<{ key: string; label: string; tokens: number }>;
	ratios: Record<string, number>;
	conversation: { user: number; assistant: number; toolResult: number };
	total: number;
	skills: Array<{ name: string }>;
	plugins: Array<{ display: string; tools: number; commands: number }>;
	mcps: Array<{ name: string; source: string; disabled: boolean; tools?: number }>;
}

const CATEGORY_HEADER = "────────── 上下文占用 ──────────";
const RESOURCES_HEADER = "────────── 已加载资源 ──────────";
const TOTAL_SEPARATOR = "──────────────";

/** Role of a panel row, used by renderers to pick theme colors. */
export type PanelRowRole =
	| "overview"
	| "category-header"
	| "category"
	| "conversation"
	| "separator"
	| "total"
	| "resource-header"
	| "resource";

export interface PanelRow {
	role: PanelRowRole;
	text: string;
}

/** Assemble the full panel as role-tagged rows (renderer-friendly). */
export function buildPanelRows(data: PanelData): PanelRow[] {
	const rows: PanelRow[] = [];
	rows.push({ role: "overview", text: renderOverviewLine(data.overview) });
	rows.push({ role: "category-header", text: CATEGORY_HEADER });

	const catWidth = data.categories.reduce((max, c) => Math.max(max, displayWidth(c.label) + 2), 0);
	for (const c of data.categories) {
		rows.push({ role: "category", text: renderBarRow({ label: c.label, tokens: c.tokens, ratio: data.ratios[c.key] ?? 0, labelWidth: catWidth }) });
	}

	const subs: Array<{ label: string; tokens: number }> = [
		{ label: "用户", tokens: data.conversation.user },
		{ label: "助手", tokens: data.conversation.assistant },
		{ label: "工具结果", tokens: data.conversation.toolResult },
	];
	for (const s of subs) {
		rows.push(
			{
				role: "conversation",
				text: renderBarRow({
					label: `  ${s.label}`,
					tokens: s.tokens,
					ratio: data.total > 0 ? s.tokens / data.total : 0,
					labelWidth: catWidth,
				}),
			},
		);
	}

	rows.push({ role: "separator", text: TOTAL_SEPARATOR });
	rows.push({ role: "total", text: renderTotalLine("分类合计", data.total, "(≈估算)", catWidth) });
	rows.push({ role: "resource-header", text: RESOURCES_HEADER });
	for (const line of renderYamlList(`skills (${data.skills.length}):`, data.skills.map((s) => s.name))) {
		rows.push({ role: "resource", text: line });
	}
	for (const line of renderYamlList(`plugins (${data.plugins.length}):`, pluginItemLabels(data.plugins))) {
		rows.push({ role: "resource", text: line });
	}
	for (const line of renderYamlList(`mcps (${data.mcps.length}):`, mcpItemLabels(data.mcps))) {
		rows.push({ role: "resource", text: line });
	}
	return rows;
}

/** Assemble the full multi-line panel text (plain, no theme colors). */
export function buildPanelLines(data: PanelData): string[] {
	return buildPanelRows(data).map((row) => row.text);
}

/** Single-line summary used for the collapsed entry and non-TUI notify. */
export function renderSummaryLine(data: PanelData): string {
	const { tokens, contextWindow, percent } = data.overview;
	const p = formatPercent(percent);
	const t = tokens === null ? "?" : formatTokens(tokens);
	const w = contextWindow === null || contextWindow <= 0 ? "?" : formatTokens(contextWindow);
	return `context ${p} (${t}/${w}) · skills ${data.skills.length} · plugins ${data.plugins.length} · mcps ${data.mcps.length}`;
}
