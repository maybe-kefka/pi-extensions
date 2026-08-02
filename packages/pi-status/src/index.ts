/**
 * @kefka/pi-status — /status extension.
 *
 * Thin wiring layer: pulls data from the pi extension API, delegates to the
 * pure modules (context / format / resources / mcp-config), and renders the
 * panel as a full-screen overlay (TUI mode, Esc/Ctrl+C closes) or a
 * single-line notify in non-TUI modes.
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { computeContextBreakdown, contextMessagesFromEntries } from "./context.js";
import { buildPanelLines } from "./format.js";
import { listMcpServers } from "./mcp-config.js";
import { StatusOverlay } from "./overlay.js";
import { summarizeResources } from "./resources.js";

export default function statusExtension(pi: ExtensionAPI): void {
	pi.registerCommand("status", {
		description: "Show context usage breakdown and loaded resources",
		handler: async (_args, ctx) => {
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
				await ctx.ui.custom<void>((_tui, _theme, _kb, done) => {
					return new StatusOverlay({ lines, onClose: () => done() });
				}, { overlay: true });
			} else {
				ctx.ui.notify(
					`context ${percent !== null ? `${(percent * 100).toFixed(1)}%` : "--"} (${tokens ?? "?"}/${contextWindow ?? "?"}) · skills ${resources.skills.length} · plugins ${resources.plugins.length} · mcps ${resources.mcps.length}`,
					"info",
				);
			}
		},
	});
}
