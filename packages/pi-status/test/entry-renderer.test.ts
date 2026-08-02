import { join } from "node:path";
import { homedir } from "node:os";
import { beforeEach, describe, expect, it } from "vitest";
import type { CustomEntry, Theme } from "@earendil-works/pi-coding-agent";
import { renderStatusEntry, setStatusData, STATUS_ENTRY_TYPE } from "../src/entry-renderer.js";
import { buildPanelLines, type PanelData } from "../src/format.js";

/** Minimal theme stub: colors pass through unchanged so rendered text is plain. */
const stubTheme = {
	fg: (_color: string, s: string) => s,
	bg: (_color: string, s: string) => s,
	bold: (s: string) => s,
} as unknown as Theme;

const data: PanelData = {
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

const otherData: PanelData = {
	...data,
	overview: { ...data.overview, tokens: 70000, percent: 0.547 },
};

function makeEntry(snapshot: PanelData | undefined): CustomEntry<PanelData> {
	return { type: "custom", customType: STATUS_ENTRY_TYPE, data: snapshot } as unknown as CustomEntry<PanelData>;
}

/** Text pads lines to render width (differential rendering); normalize for asserts. */
function renderLines(component: ReturnType<typeof renderStatusEntry>, width: number): string[] {
	return (component?.render(width) ?? []).map((line) => line.trimEnd());
}

beforeEach(() => {
	setStatusData(null);
});

describe("renderStatusEntry", () => {
	it("renders the full panel for the entry holding the current snapshot", () => {
		setStatusData(data);
		const component = renderStatusEntry(makeEntry(data), { expanded: true }, stubTheme);
		expect(renderLines(component, 200)).toEqual(buildPanelLines(data));
	});

	it("returns undefined for entries that are not the current snapshot (older duplicates)", () => {
		setStatusData(data);
		expect(renderStatusEntry(makeEntry(otherData), { expanded: false }, stubTheme)).toBeUndefined();
	});

	it("returns undefined when no snapshot is set", () => {
		expect(renderStatusEntry(makeEntry(data), { expanded: false }, stubTheme)).toBeUndefined();
	});

	it("updates the SAME component in place when the snapshot changes (replacement semantics)", () => {
		setStatusData(data);
		const component = renderStatusEntry(makeEntry(data), { expanded: false }, stubTheme);
		expect(renderLines(component, 200)).toEqual(buildPanelLines(data));

		// Simulate a later /status run: new snapshot, same entry object in session.
		setStatusData(otherData);
		expect(renderLines(component, 200)).toEqual(buildPanelLines(otherData));
	});
});
