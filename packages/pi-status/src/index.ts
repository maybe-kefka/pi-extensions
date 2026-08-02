/**
 * @kefka/pi-status — /status extension.
 *
 * Thin wiring layer: pulls data from the pi extension API, delegates to the
 * pure modules (context / format / resources / mcp-config), and renders the
 * panel as a TUI widget (auto-cleared after 8s) or a single-line notify in
 * non-TUI modes.
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { computeContextBreakdown, contextMessagesFromEntries } from "./context.js";
import { buildPanelLines } from "./format.js";
import { listMcpServers } from "./mcp-config.js";
import { summarizeResources } from "./resources.js";

const WIDGET_KEY = "pi-status";
const AUTO_CLEAR_MS = 8000;

let clearTimer: ReturnType<typeof setTimeout> | null = null;

function clearWidget(ctx: ExtensionCommandContext): void {
	try {
		ctx.ui.setWidget(WIDGET_KEY, undefined);
	} catch {
		// Session may have switched; widget is cleaned up by the runtime.
	}
}

export default function statusExtension(pi: ExtensionAPI): void {
	pi.registerCommand("status", {
		description: "Show context usage breakdown and loaded resources",
		handler: async (_args, ctx) => {
			if (clearTimer !== null) {
				clearTimeout(clearTimer);
				clearTimer = null;
			}

			const usage = ctx.getContextUsage();
			const tokens = usage?.tokens ?? null;
			const contextWindow = usage?.contextWindow ?? null;
			const percent = usage?.percent ?? null;

			const options = ctx.getSystemPromptOptions();
			const skills = options.skills ?? [];
			const messages = contextMessagesFromEntries(ctx.sessionManager.buildContextEntries());

			const breakdown = computeContextBreakdown({
				customPrompt: options.customPrompt ?? null,
				guidelines: options.promptGuidelines ?? [],
				appendSystemPrompt: options.appendSystemPrompt ?? null,
				contextFiles: options.contextFiles ?? [],
				skills,
				toolSnippets: options.toolSnippets ?? {},
				messages,
			});

			const resources = summarizeResources({
				tools: pi.getAllTools(),
				commands: pi.getCommands(),
				skills,
				mcps: listMcpServers(ctx.cwd),
			});

			const modelName = ctx.model?.name ?? ctx.model?.id ?? "未知模型";

			const lines = buildPanelLines({
				overview: { model: modelName, contextWindow, tokens, percent },
				categories: breakdown.categories,
				ratios: breakdown.ratios,
				conversation: breakdown.conversation,
				total: breakdown.total,
				skills: resources.skills,
				plugins: resources.plugins,
				mcps: resources.mcps,
			});

			if (ctx.mode === "tui") {
				ctx.ui.setWidget(WIDGET_KEY, lines);
				clearTimer = setTimeout(() => clearWidget(ctx), AUTO_CLEAR_MS);
			} else {
				ctx.ui.notify(
					`context ${percent !== null ? `${(percent * 100).toFixed(1)}%` : "--"} (${tokens ?? "?"}/${contextWindow ?? "?"}) · skills ${resources.skills.length} · plugins ${resources.plugins.length} · mcps ${resources.mcps.length}`,
					"info",
				);
			}
		},
	});
}
