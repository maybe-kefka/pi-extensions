/**
 * Chat-transcript renderer for /status snapshots.
 *
 * The command appends a CustomEntry (pi.appendEntry) which is rendered inside
 * the conversation like an LLM message — scrollable, no line limit, and never
 * sent to the LLM. Always renders the full role-tagged panel; the collapsed
 * summary variant was removed because users expect the complete breakdown.
 */

import type { CustomEntry, EntryRenderer, Theme } from "@earendil-works/pi-coding-agent";
import { Container, Text } from "@earendil-works/pi-tui";
import { buildPanelRows, type PanelData, type PanelRowRole } from "./format.js";

/** customType used for both appendEntry and registerEntryRenderer. */
export const STATUS_ENTRY_TYPE = "status-panel";

function colorForRole(role: PanelRowRole, theme: Theme, text: string): string {
	switch (role) {
		case "overview":
			return theme.fg("accent", text);
		case "category-header":
		case "resource-header":
			return theme.fg("muted", text);
		case "separator":
		case "total":
			return theme.fg("dim", text);
		default:
			return theme.fg("text", text);
	}
}

export const renderStatusEntry: EntryRenderer<PanelData> = (entry, _options, theme) => {
	const data = entry.data;
	if (!data) {
		return new Text(theme.fg("dim", "[status] 无数据"), 0, 0);
	}

	const container = new Container();
	for (const row of buildPanelRows(data)) {
		container.addChild(new Text(colorForRole(row.role, theme, row.text), 0, 0));
	}
	return container;
};

