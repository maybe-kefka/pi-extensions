/**
 * @kefka/pi-status — /status extension.
 *
 * Thin wiring layer: pulls data from the pi extension API, delegates to the
 * pure modules (context / format / resources / mcp-config), and maintains a
 * single status snapshot in the chat (TUI mode) or a single-line notify
 * (non-TUI modes).
 *
 * TUI mode keeps ONE "status-panel" session entry per session; subsequent
 * /status runs update the panel in place (see entry-renderer.ts), so the
 * conversation never fills with status entries.
 */

import type { CustomEntry, ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { computeContextBreakdown, contextMessagesFromEntries } from "./context.js";
import { renderStatusEntry, setStatusData, STATUS_ENTRY_TYPE } from "./entry-renderer.js";
import { normalizeUsagePercent, renderSummaryLine, type PanelData } from "./format.js";
import { listMcpServers } from "./mcp-config.js";
import { summarizeResources } from "./resources.js";

export default function statusExtension(pi: ExtensionAPI): void {
	// Render the single status snapshot inside the chat transcript.
	pi.registerEntryRenderer<PanelData>(STATUS_ENTRY_TYPE, renderStatusEntry);

	// Restore the persisted snapshot when a session loads or switches.
	pi.on("session_start", (_event, ctx) => {
		let restored: PanelData | null = null;
		for (const entry of ctx.sessionManager.getEntries()) {
			if (entry.type === "custom" && entry.customType === STATUS_ENTRY_TYPE) {
				restored = (entry as CustomEntry<PanelData>).data ?? null;
			}
		}
		setStatusData(restored);
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
				// Append the session entry only once per session leaf path; later
				// runs just update the module snapshot (panel refreshes on redraw).
				const hasEntry = ctx.sessionManager
					.buildContextEntries()
					.some((e) => e.type === "custom" && e.customType === STATUS_ENTRY_TYPE);
				if (!hasEntry) {
					pi.appendEntry<PanelData>(STATUS_ENTRY_TYPE, data);
				}
				// Guaranteed redraw so the existing panel refreshes with the new
				// snapshot; the footer status doubles as confirmation feedback.
				ctx.ui.setStatus("pi-status", renderSummaryLine(data));
			} else {
				ctx.ui.notify(renderSummaryLine(data), "info");
			}
		},
	});
}
