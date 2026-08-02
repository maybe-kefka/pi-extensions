import { describe, expect, it } from "vitest";
import { summarizeResources, type ResourcesInput } from "../src/resources.js";

describe("summarizeResources", () => {
	it("groups tools and extension commands by plugin source", () => {
		const input: ResourcesInput = {
			tools: [
				{ name: "bash", sourceInfo: { source: "builtin" } },
				{ name: "read", sourceInfo: { source: "builtin" } },
				{ name: "mcp", sourceInfo: { source: "npm:pi-mcp-adapter" } },
				{ name: "tinyfish_search", sourceInfo: { source: "npm:pi-tinyfish-tools" } },
				{ name: "tinyfish_fetch", sourceInfo: { source: "npm:pi-tinyfish-tools" } },
			],
			commands: [
				{ name: "mcp", source: "extension", sourceInfo: { source: "npm:pi-mcp-adapter" } },
				{ name: "status", source: "extension", sourceInfo: { source: "/home/u/.pi/agent/extensions/status.ts" } },
				{ name: "skill:docx", source: "skill", sourceInfo: { source: "npm:pi-ext" } },
			],
			skills: [
				{ name: "docx", description: "Word documents" },
				{ name: "pdf", description: "PDF files" },
			],
			mcps: [{ name: "github", source: "/home/u/.agents/mcp.json", disabled: false }],
		};

		const result = summarizeResources(input);

		expect(result.skills).toEqual([
			{ name: "docx", description: "Word documents" },
			{ name: "pdf", description: "PDF files" },
		]);
		expect(result.mcps).toHaveLength(1);

		// builtin tools excluded; plugins sorted by display name (basename for paths)
		expect(result.plugins.map((p) => p.display)).toEqual([
			"npm:pi-mcp-adapter",
			"npm:pi-tinyfish-tools",
			"status.ts",
		]);

		const adapter = result.plugins.find((p) => p.display === "npm:pi-mcp-adapter")!;
		expect(adapter.tools).toBe(1);
		expect(adapter.commands).toBe(1);

		const tinyfish = result.plugins.find((p) => p.display === "npm:pi-tinyfish-tools")!;
		expect(tinyfish.tools).toBe(2);
		expect(tinyfish.commands).toBe(0);

		const local = result.plugins.find((p) => p.display === "status.ts")!;
		expect(local.tools).toBe(0);
		expect(local.commands).toBe(1);
	});

	it("keeps single-file extensions as basename", () => {
		const result = summarizeResources({
			tools: [],
			commands: [
				{ name: "status", source: "extension", sourceInfo: { source: "/home/u/.pi/agent/extensions/status.ts" } },
				{ name: "hello", source: "extension", sourceInfo: { source: "/home/u/.pi/agent/extensions/hello.ts" } },
			],
			skills: [],
			mcps: [],
		});
		expect(result.plugins.map((p) => p.display)).toEqual(["hello.ts", "status.ts"]);
	});

	it("handles empty input without crashing", () => {
		const result = summarizeResources({ tools: [], commands: [], skills: [], mcps: [] });
		expect(result.plugins).toEqual([]);
		expect(result.skills).toEqual([]);
		expect(result.mcps).toEqual([]);
	});

	it("drops tools without source info and skill/prompt commands", () => {
		const result = summarizeResources({
			tools: [{ name: "odd", sourceInfo: undefined }],
			commands: [
				{ name: "t", source: "prompt", sourceInfo: { source: "npm:theme" } },
				{ name: "s", source: "skill", sourceInfo: { source: "npm:skillpack" } },
			],
			skills: [],
			mcps: [],
		});
		expect(result.plugins).toEqual([]);
	});
});
