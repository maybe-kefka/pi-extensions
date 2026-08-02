import { join } from "node:path";
import { homedir } from "node:os";
import { describe, expect, it } from "vitest";
import {
	bar,
	buildPanelLines,
	buildPanelRows,
	displayWidth,
	formatCompact,
	formatPercent,
	formatTokens,
	padDisplay,
	renderBarRow,
	renderMcpsLine,
	renderOverviewLine,
	renderPluginsLine,
	renderSkillsLine,
	renderSummaryLine,
	renderTotalLine,
} from "../src/format.js";

describe("formatTokens", () => {
	it("formats with thousands separators", () => {
		expect(formatTokens(123456)).toBe("123,456");
		expect(formatTokens(1000000)).toBe("1,000,000");
	});

	it("handles zero", () => {
		expect(formatTokens(0)).toBe("0");
	});
});

describe("formatCompact", () => {
	it("formats thousands as k", () => {
		expect(formatCompact(128000)).toBe("128k");
		expect(formatCompact(1000)).toBe("1k");
	});

	it("formats millions as M with one decimal", () => {
		expect(formatCompact(2500000)).toBe("2.5M");
		expect(formatCompact(1000000)).toBe("1M");
	});

	it("leaves small numbers as-is", () => {
		expect(formatCompact(999)).toBe("999");
		expect(formatCompact(0)).toBe("0");
	});
});

describe("formatPercent", () => {
	it("formats ratio with one decimal", () => {
		expect(formatPercent(0.617)).toBe("61.7%");
		expect(formatPercent(1)).toBe("100.0%");
		expect(formatPercent(0)).toBe("0.0%");
	});

	it("returns -- for null or non-finite", () => {
		expect(formatPercent(null)).toBe("--");
		expect(formatPercent(Number.NaN)).toBe("--");
	});
});

describe("bar", () => {
	it("renders a 10-wide bar by default", () => {
		expect(bar(0.617)).toBe("██████░░░░");
		expect(bar(0)).toBe("░░░░░░░░░░");
		expect(bar(1)).toBe("██████████");
	});

	it("rounds fractional fill", () => {
		expect(bar(0.05)).toBe("█░░░░░░░░░");
	});

	it("respects custom width", () => {
		expect(bar(0.617, 5)).toBe("███░░");
	});

	it("clamps out-of-range ratios", () => {
		expect(bar(1.5)).toBe("██████████");
		expect(bar(-0.5)).toBe("░░░░░░░░░░");
	});
});

describe("displayWidth", () => {
	it("counts ASCII as 1", () => {
		expect(displayWidth("abc")).toBe(3);
	});

	it("counts CJK as 2", () => {
		expect(displayWidth("系统提示词")).toBe(10);
		expect(displayWidth("a中b")).toBe(4);
	});
});

describe("padDisplay", () => {
	it("pads by display width, not char count", () => {
		expect(padDisplay("系统提示词", 12)).toBe("系统提示词  ");
		expect(padDisplay("abc", 5)).toBe("abc  ");
	});

	it("does not truncate when already wide enough", () => {
		expect(padDisplay("abcdef", 5)).toBe("abcdef");
	});
});

describe("renderBarRow", () => {
	it("renders label + tokens + bar + percent aligned", () => {
		const row = renderBarRow({ label: "系统提示词", tokens: 5200, ratio: 0.104 });
		expect(row).toBe("系统提示词    5,200 █░░░░░░░░░  10.4%");
	});

	it("uses explicit labelWidth when wider than default", () => {
		const row = renderBarRow({ label: "对话消息", tokens: 30500, ratio: 0.61, labelWidth: 14 });
		expect(row).toBe("对话消息       30,500 ██████░░░░  61.0%");
	});
});

describe("renderTotalLine", () => {
	it("renders a total line with optional note", () => {
		expect(renderTotalLine("分类合计", 50000, "(≈估算)")).toBe("分类合计   50,000 (≈估算)");
		expect(renderTotalLine("分类合计", 0)).toBe("分类合计        0");
	});
});

describe("renderOverviewLine", () => {
	it("renders model, window, tokens and percent", () => {
		expect(
			renderOverviewLine({ model: "deepseek-v4-flash", contextWindow: 128000, tokens: 62500, percent: 0.488 }),
		).toBe("deepseek-v4-flash | 窗口: 128k | 已用: 62,500 tokens (48.8%)");
	});

	it("shows 待更新 when tokens are unknown", () => {
		expect(renderOverviewLine({ model: "m", contextWindow: 128000, tokens: null, percent: null })).toBe(
			"m | 窗口: 128k | 已用: 待更新",
		);
	});

	it("shows -- when context window is unknown or zero", () => {
		expect(renderOverviewLine({ model: "m", contextWindow: null, tokens: 100, percent: null })).toBe("m | 窗口: -- | 已用: 100 tokens");
		expect(renderOverviewLine({ model: "m", contextWindow: 0, tokens: 100, percent: null })).toBe("m | 窗口: -- | 已用: 100 tokens");
	});
});

describe("renderSkillsLine", () => {
	it("lists skill names", () => {
		expect(renderSkillsLine([{ name: "docx" }, { name: "pdf" }, { name: "chinese-novelist" }])).toBe(
			"skills (3): docx, pdf, chinese-novelist",
		);
	});

	it("handles empty list", () => {
		expect(renderSkillsLine([])).toBe("skills (0)");
	});
});

describe("renderPluginsLine", () => {
	it("lists plugins with tool/command counts (singular/plural, zero omitted)", () => {
		const plugins = [
			{ display: "npm:pi-subagents", tools: 2, commands: 1 },
			{ display: "status.ts", tools: 0, commands: 1 },
			{ display: "npm:pi-simplify", tools: 1, commands: 0 },
		];
		expect(renderPluginsLine(plugins)).toBe(
			"plugins (3): npm:pi-subagents (2 tools, 1 cmd), status.ts (1 cmd), npm:pi-simplify (1 tool)",
		);
	});

	it("handles empty list", () => {
		expect(renderPluginsLine([])).toBe("plugins (0)");
	});
});

describe("renderMcpsLine", () => {
	it("lists servers with disabled flag and ~-abbreviated source", () => {
		const home = homedir();
		const mcps = [
			{ name: "github", source: join(home, ".agents", "mcp.json"), disabled: false },
			{ name: "filesystem", source: "/proj/.pi/mcp.json", disabled: true },
		];
		expect(renderMcpsLine(mcps)).toBe(
			`mcps (2): github [~/.agents/mcp.json], filesystem (disabled) [/proj/.pi/mcp.json]`,
		);
	});

	it("handles empty list", () => {
		expect(renderMcpsLine([])).toBe("mcps (0)");
	});
});

describe("buildPanelLines", () => {
	it("assembles the full panel with aligned columns", () => {
		const lines = buildPanelLines({
			overview: { model: "deepseek-v4-flash", contextWindow: 128000, tokens: 62500, percent: 0.488 },
			categories: [
				{ key: "system", label: "系统提示词", tokens: 5200 },
				{ key: "contextFiles", label: "上下文文件", tokens: 3100 },
				{ key: "skills", label: "技能", tokens: 1400 },
				{ key: "tools", label: "工具定义", tokens: 9800 },
				{ key: "conversation", label: "对话消息", tokens: 30500 },
			],
			ratios: { system: 0.104, contextFiles: 0.062, skills: 0.028, tools: 0.196, conversation: 0.61 },
			conversation: { user: 12000, assistant: 10200, toolResult: 8300 },
			total: 50000,
			skills: [{ name: "docx" }, { name: "pdf" }],
			plugins: [{ display: "npm:pi-mcp-adapter", tools: 1, commands: 0 }],
			mcps: [{ name: "github", source: join(homedir(), ".agents", "mcp.json"), disabled: false }],
		});

		expect(lines).toEqual([
			"deepseek-v4-flash | 窗口: 128k | 已用: 62,500 tokens (48.8%)",
			"────────── 上下文占用 ──────────",
			"系统提示词    5,200 █░░░░░░░░░  10.4%",
			"上下文文件    3,100 █░░░░░░░░░   6.2%",
			"技能          1,400 ░░░░░░░░░░   2.8%",
			"工具定义      9,800 ██░░░░░░░░  19.6%",
			"对话消息     30,500 ██████░░░░  61.0%",
			"  用户       12,000 ██░░░░░░░░  24.0%",
			"  助手       10,200 ██░░░░░░░░  20.4%",
			"  工具结果    8,300 ██░░░░░░░░  16.6%",
			"──────────────",
			"分类合计     50,000 (≈估算)",
			"────────── 已加载资源 ──────────",
			"skills (2): docx, pdf",
			"plugins (1): npm:pi-mcp-adapter (1 tool)",
			"mcps (1): github [~/.agents/mcp.json]",
		]);
	});
});

describe("buildPanelRows", () => {
	const data = {
		overview: { model: "deepseek-v4-flash", contextWindow: 128000, tokens: 62500, percent: 0.488 },
		categories: [
			{ key: "system", label: "系统提示词", tokens: 5200 },
			{ key: "contextFiles", label: "上下文文件", tokens: 3100 },
			{ key: "skills", label: "技能", tokens: 1400 },
			{ key: "tools", label: "工具定义", tokens: 9800 },
			{ key: "conversation", label: "对话消息", tokens: 30500 },
		],
		ratios: { system: 0.104, contextFiles: 0.062, skills: 0.028, tools: 0.196, conversation: 0.61 },
		conversation: { user: 12000, assistant: 10200, toolResult: 8300 },
		total: 50000,
		skills: [{ name: "docx" }, { name: "pdf" }],
		plugins: [{ display: "npm:pi-mcp-adapter", tools: 1, commands: 0 }],
		mcps: [{ name: "github", source: join(homedir(), ".agents", "mcp.json"), disabled: false }],
	};

	it("tags each row with a role, in panel order", () => {
		const rows = buildPanelRows(data);
		expect(rows.map((r) => r.role)).toEqual([
			"overview",
			"category-header",
			"category",
			"category",
			"category",
			"category",
			"category",
			"conversation",
			"conversation",
			"conversation",
			"separator",
			"total",
			"resource-header",
			"resource",
			"resource",
			"resource",
		]);
	});

	it("text matches buildPanelLines output", () => {
		expect(buildPanelRows(data).map((r) => r.text)).toEqual(buildPanelLines(data));
	});
});

describe("renderSummaryLine", () => {
	it("renders a compact one-liner with counts", () => {
		const line = renderSummaryLine({
			overview: { model: "m", contextWindow: 128000, tokens: 62500, percent: 0.488 },
			categories: [],
			ratios: {},
			conversation: { user: 0, assistant: 0, toolResult: 0 },
			total: 0,
			skills: [{ name: "docx" }, { name: "pdf" }, { name: "pdf" }],
			plugins: [{ display: "p", tools: 1, commands: 0 }],
			mcps: [{ name: "g", source: "s", disabled: false }],
		});
		expect(line).toBe("context 48.8% (62,500/128,000) · skills 3 · plugins 1 · mcps 1");
	});

	it("shows ? when usage is unknown", () => {
		const line = renderSummaryLine({
			overview: { model: "m", contextWindow: null, tokens: null, percent: null },
			categories: [],
			ratios: {},
			conversation: { user: 0, assistant: 0, toolResult: 0 },
			total: 0,
			skills: [],
			plugins: [],
			mcps: [],
		});
		expect(line).toBe("context -- (?/?) · skills 0 · plugins 0 · mcps 0");
	});
});
