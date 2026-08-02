/**
 * Aggregate loaded resources (skills / plugins / mcps) for the /status panel.
 * Pure functions over structural subsets of pi's ToolInfo / SlashCommandInfo /
 * Skill types. Plugin sources are deduped from tool + extension command
 * sourceInfo; builtin/sdk sources are excluded.
 */

import { basename } from "node:path";
import type { McpServerConfig } from "./mcp-config.js";

export interface ToolLike {
	name: string;
	sourceInfo?: { source?: string };
}

export interface CommandLike {
	name: string;
	source: string;
	sourceInfo?: { source?: string };
}

export interface SkillInfoLike {
	name: string;
	description?: string;
}

export interface ResourcesInput {
	tools: ToolLike[];
	commands: CommandLike[];
	skills: SkillInfoLike[];
	mcps: McpServerConfig[];
}

export interface PluginInfo {
	/** sourceInfo.source as-is (e.g. "npm:pi-subagents" or an extension path). */
	source: string;
	/** Display name: path sources -> basename, others -> source itself. */
	display: string;
	tools: number;
	commands: number;
}

export interface McpSummary extends McpServerConfig {
	/**
	 * Number of pi-mcp-adapter tools prefixed with this server name
	 * (SPEC §5.3). 0 when undeterminable (tools omitted from display).
	 */
	tools: number;
}

export interface ResourcesSummary {
	skills: SkillInfoLike[];
	plugins: PluginInfo[];
	mcps: McpSummary[];
}

const EXCLUDED_SOURCES = new Set(["builtin", "sdk"]);
/** Source of pi-mcp-adapter tools (tool names are `<server>_<tool>`). */
const MCP_ADAPTER_SOURCES = ["npm:pi-mcp-adapter", "pi-mcp-adapter"];

function isMcpAdapterTool(tool: ToolLike): boolean {
	const src = tool.sourceInfo?.source;
	if (!src) return false;
	return MCP_ADAPTER_SOURCES.some((s) => src.includes(s));
}

/** Count pi-mcp-adapter tools whose name is prefixed `<server>_`. */
export function countMcpTools(tools: ToolLike[], serverName: string): number {
	const prefix = serverName.replace(/-/g, "_") + "_";
	return tools.filter((t) => isMcpAdapterTool(t) && t.name.startsWith(prefix)).length;
}

function isPathSource(source: string): boolean {
	return source.includes("/") || source.startsWith(".");
}

/** Aggregate skills/plugins/mcps from raw pi API inputs. */
export function summarizeResources(input: ResourcesInput): ResourcesSummary {
	const counts = new Map<string, { tools: number; commands: number }>();

	for (const tool of input.tools) {
		const src = tool.sourceInfo?.source;
		if (!src || EXCLUDED_SOURCES.has(src)) continue;
		const entry = counts.get(src) ?? { tools: 0, commands: 0 };
		entry.tools += 1;
		counts.set(src, entry);
	}

	for (const command of input.commands) {
		if (command.source !== "extension") continue;
		const src = command.sourceInfo?.source;
		if (!src) continue;
		const entry = counts.get(src) ?? { tools: 0, commands: 0 };
		entry.commands += 1;
		counts.set(src, entry);
	}

	const plugins = [...counts.entries()]
		.map(([source, { tools, commands }]) => ({
			source,
			display: isPathSource(source) ? basename(source) : source,
			tools,
			commands,
		}))
		.sort((a, b) => (a.display < b.display ? -1 : a.display > b.display ? 1 : 0));

	return {
		skills: [...input.skills],
		plugins,
		mcps: input.mcps.map((mcp) => ({
			...mcp,
			tools: countMcpTools(input.tools, mcp.name),
		})),
	};
}
