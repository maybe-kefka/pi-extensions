/**
 * MCP server config discovery and parsing.
 * Reads the same standard config locations the MCP adapter uses, so /status
 * can list configured servers without depending on the adapter's internals.
 * Note: this reflects *configured* servers, not connection state.
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface McpServerConfig {
	name: string;
	/** Config file the server was found in (absolute path). */
	source: string;
	disabled: boolean;
}

/** Candidate config files in priority order (project first). */
export function mcpConfigCandidates(cwd: string, homeDir?: string): string[] {
	const home = homeDir ?? homedir();
	return [
		join(cwd, ".pi", "mcp.json"),
		join(cwd, ".mcp.json"),
		join(home, ".agents", "mcp.json"),
		join(home, ".agents", "mcp", "mcp.json"),
		join(home, ".config", "mcp", "mcp.json"),
	];
}

/**
 * Parse one MCP config file.
 * Returns null when the file is missing or malformed (skipped silently),
 * otherwise a list of server entries (possibly empty).
 */
export function parseMcpConfigFile(filePath: string): McpServerConfig[] | null {
	if (!existsSync(filePath)) return null;

	let raw: string;
	try {
		raw = readFileSync(filePath, "utf8");
	} catch {
		return null;
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return null;
	}

	if (typeof parsed !== "object" || parsed === null) return [];
	const servers = (parsed as Record<string, unknown>).mcpServers;
	if (typeof servers !== "object" || servers === null || Array.isArray(servers)) return [];

	return Object.entries(servers as Record<string, unknown>).map(([name, value]) => {
		const entry = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
		return { name, source: filePath, disabled: entry.disabled === true };
	});
}

/** Aggregate configured MCP servers across all candidate files, deduped by name. */
export function listMcpServers(cwd: string, homeDir?: string): McpServerConfig[] {
	const seen = new Set<string>();
	const result: McpServerConfig[] = [];
	for (const candidate of mcpConfigCandidates(cwd, homeDir)) {
		const servers = parseMcpConfigFile(candidate);
		if (!servers) continue;
		for (const server of servers) {
			if (seen.has(server.name)) continue;
			seen.add(server.name);
			result.push(server);
		}
	}
	return result;
}
