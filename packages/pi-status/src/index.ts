/**
 * @kefka/pi-status — /status extension.
 *
 * Thin wiring layer: pulls data from the pi extension API, delegates to the
 * pure modules (context / format / resources / mcp-config), and shows the
 * snapshot as a fixed widget above the editor (TUI mode) or a single-line
 * notify (non-TUI modes).
 *
 * TUI mode uses setWidget with a stable key: every /status run replaces the
 * same panel in place (visible immediately, no accumulation, no keyboard
 * capture). The footer status carries a timestamp + summary as feedback.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { computeContextBreakdown, contextMessagesFromEntries } from "./context.js";
import { normalizeUsagePercent, renderSummaryLine, type PanelData } from "./format.js";
import { listMcpServers } from "./mcp-config.js";
import { summarizeResources } from "./resources.js";
import { renderStatusWidget, setStatusData, STATUS_WIDGET_KEY } from "./widget.js";

export default function statusExtension(pi: ExtensionAPI): void {
	// Collapse the panel when the user submits their next message. /status is
	// handled before the input event fires, so running /status itself never
	// triggers this.
	pi.on("input", (_event, ctx) => {
		if (ctx.mode === "tui") {
			ctx.ui.setWidget(STATUS_WIDGET_KEY, undefined);
			ctx.ui.setStatus(STATUS_WIDGET_KEY, undefined);
		}
		return { action: "continue" };
	});

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
				setStatusData(data);
				// Same widget key -> replaces the previous panel in place.
				ctx.ui.setWidget(STATUS_WIDGET_KEY, (_tui, theme) => renderStatusWidget(theme));
				// Footer feedback: timestamp changes every run, so /status always
				// gives visible confirmation even when context data is unchanged.
				const time = new Date().toLocaleTimeString();
				ctx.ui.setStatus(STATUS_WIDGET_KEY, `${time} · ${renderSummaryLine(data)}`);
			} else {
				ctx.ui.notify(renderSummaryLine(data), "info");
			}
		},
	});
}
