import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listMcpServers, mcpConfigCandidates, parseMcpConfigFile } from "../src/mcp-config.js";

describe("mcpConfigCandidates", () => {
	it("prioritizes project configs over global ones", () => {
		const candidates = mcpConfigCandidates("/proj", "/home/u");
		expect(candidates).toEqual([
			"/proj/.pi/mcp.json",
			"/proj/.mcp.json",
			"/home/u/.agents/mcp.json",
			"/home/u/.agents/mcp/mcp.json",
			"/home/u/.config/mcp/mcp.json",
		]);
	});
});

describe("parseMcpConfigFile", () => {
	let dir: string;

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), "pi-status-mcp-"));
	});

	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	it("returns null when the file does not exist", () => {
		expect(parseMcpConfigFile(join(dir, "nope.json"))).toBeNull();
	});

	it("parses mcpServers keys with disabled flag", () => {
		const file = join(dir, "mcp.json");
		writeFileSync(file, JSON.stringify({ mcpServers: { github: {}, filesystem: { disabled: true } } }));
		expect(parseMcpConfigFile(file)).toEqual([
			{ name: "github", source: file, disabled: false },
			{ name: "filesystem", source: file, disabled: true },
		]);
	});

	it("returns [] when mcpServers key is missing", () => {
		const file = join(dir, "mcp.json");
		writeFileSync(file, JSON.stringify({ other: true }));
		expect(parseMcpConfigFile(file)).toEqual([]);
	});

	it("returns [] when mcpServers is not an object", () => {
		const file = join(dir, "mcp.json");
		writeFileSync(file, JSON.stringify({ mcpServers: ["github"] }));
		expect(parseMcpConfigFile(file)).toEqual([]);
	});

	it("returns null on malformed JSON", () => {
		const file = join(dir, "mcp.json");
		writeFileSync(file, "{ not json");
		expect(parseMcpConfigFile(file)).toBeNull();
	});
});

describe("listMcpServers", () => {
	let cwd: string;
	let home: string;

	beforeEach(() => {
		cwd = mkdtempSync(join(tmpdir(), "pi-status-cwd-"));
		home = mkdtempSync(join(tmpdir(), "pi-status-home-"));
	});

	afterEach(() => {
		rmSync(cwd, { recursive: true, force: true });
		rmSync(home, { recursive: true, force: true });
	});

	function writeAt(abs: string, content: unknown): void {
		mkdirSync(join(abs, ".."), { recursive: true });
		writeFileSync(abs, JSON.stringify(content));
	}

	it("returns empty list when no config files exist", () => {
		expect(listMcpServers(cwd, home)).toEqual([]);
	});

	it("merges servers from project and global configs", () => {
		writeAt(join(cwd, ".pi", "mcp.json"), { mcpServers: { projectSrv: {} } });
		writeAt(join(cwd, ".mcp.json"), { mcpServers: { second: { disabled: true } } });
		writeAt(join(home, ".agents", "mcp.json"), { mcpServers: { globalSrv: {} } });

		const result = listMcpServers(cwd, home);
		expect(result.map((s) => s.name)).toEqual(["projectSrv", "second", "globalSrv"]);
		expect(result[1]!.disabled).toBe(true);
		expect(result[2]!.source).toContain(".agents");
	});

	it("dedupes same-name servers keeping the first (project) source", () => {
		writeAt(join(cwd, ".pi", "mcp.json"), { mcpServers: { dup: {} } });
		writeAt(join(home, ".agents", "mcp.json"), { mcpServers: { dup: { disabled: true } } });

		const result = listMcpServers(cwd, home);
		expect(result).toHaveLength(1);
		expect(result[0]!.name).toBe("dup");
		expect(result[0]!.source).toContain(".pi/mcp.json");
		expect(result[0]!.disabled).toBe(false);
	});

	it("skips malformed files without throwing", () => {
		writeAt(join(cwd, ".pi", "mcp.json"), { mcpServers: { good: {} } });
		writeFileSync(join(cwd, ".mcp.json"), "{ broken");
		const result = listMcpServers(cwd, home);
		expect(result.map((s) => s.name)).toEqual(["good"]);
	});
});
