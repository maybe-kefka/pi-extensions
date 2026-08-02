/**
 * Pure formatting helpers for the /status panel.
 * All functions are side-effect free and unit-tested.
 */

/** Format a token count with thousands separators. */
export function formatTokens(n: number): string {
	return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Compact display: 128000 -> "128k", 2.5e6 -> "2.5M". */
export function formatCompact(n: number): string {
	if (n >= 1_000_000) {
		return `${trimDecimal(n / 1_000_000)}M`;
	}
	if (n >= 1000) {
		return `${trimDecimal(n / 1000)}k`;
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

/** Render one bar row: `<label> <tokens> <bar> <percent>`. */
export function renderBarRow(opts: BarRowOptions): string {
	const minWidth = displayWidth(opts.label) + 2;
	const labelWidth = Math.max(opts.labelWidth ?? minWidth, minWidth);
	const label = padDisplay(opts.label, labelWidth);
	const tokens = formatTokens(opts.tokens).padStart(TOKEN_COL_WIDTH);
	return `${label}${tokens} ${bar(opts.ratio)}  ${formatPercent(opts.ratio)}`;
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
