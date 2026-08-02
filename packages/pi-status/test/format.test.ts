import { describe, expect, it } from "vitest";
import {
	bar,
	displayWidth,
	formatCompact,
	formatPercent,
	formatTokens,
	padDisplay,
	renderBarRow,
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
