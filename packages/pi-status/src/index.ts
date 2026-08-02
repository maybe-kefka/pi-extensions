/**
 * @kefka/pi-status — /status extension.
 *
 * Thin wiring layer: pulls data from the pi extension API, delegates to the
 * pure modules (context / format / resources / mcp-config), and appends the
 * snapshot as a chat entry (TUI mode, rendered by entry-renderer.ts) or
 * emits a single-line notify (non-TUI modes).
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { computeContextBreakdown, contextMessagesFromEntries } from "./context.js";
import { renderStatusEntry, STATUS_ENTRY_TYPE } from "./entry-renderer.js";
import { normalizeUsagePercent, renderSummaryLine, type PanelData } from "./format.js";
import { listMcpServers } from "./mcp-config.js";
import { summarizeResources } from "./resources.js";

export default function statusExtension(pi: ExtensionAPI): void {
	// Render status snapshots inside the chat transcript (not sent to the LLM).
	pi.registerEntryRenderer<PanelData>(STATUS_ENTRY_TYPE, renderStatusEntry);

	pi.registerCommand("status", {
		description: "Show context usage breakdown and loaded resources",
		handler: async (_args, ctx) => {
		const usage = ctx.getContextUsage();
			const tokens = usage?.tokens ?? null;
			const contextWindow = usage?.contextWindow ?? null;
			// getContextUsage().percent is already a 0-100 percentage (tokens/window*100);
			// normalizeUsagePercent converts it to a 0-1 ratio for the pure layer.
			const percent = normalizeUsagePercent(usage?.percent ?? null);

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

			const data: PanelData = {
				overview: { model: modelName, contextWindow, tokens, percent },
				categories: breakdown.categories,
				ratios: breakdown.ratios,
				conversation: breakdown.conversation,
				total: breakdown.total,
				skills: resources.skills,
				plugins: resources.plugins,
				mcps: resources.mcps,
			};

			if (ctx.mode === "tui") {
				pi.appendEntry<PanelData>(STATUS_ENTRY_TYPE, data);
			} else {
				ctx.ui.notify(renderSummaryLine(data), "info");
			}
		},
	});
}
