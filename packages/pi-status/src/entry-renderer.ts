/**
 * Chat-transcript renderer for /status snapshots.
 *
 * Replacement semantics: only ONE status entry ever renders. The command keeps
 * the latest snapshot in module state (setStatusData) and appends a session
 * entry only once per session. The renderer gates on entry.data being the
 * current snapshot (reference equality), so accumulated/duplicate entries from
 * older versions return undefined and are never added to the chat.
 *
 * The returned component is non-caching and reads the module snapshot on every
 * frame, so later /status runs update the SAME panel in place instead of
 * appending new ones — the conversation never fills with status entries.
 *
 * Entries never participate in LLM context.
 */

import type { EntryRenderer, Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";
import { buildPanelRows, type PanelData, type PanelRowRole } from "./format.js";

/** customType used for both appendEntry and registerEntryRenderer. */
export const STATUS_ENTRY_TYPE = "status-panel";

let currentData: PanelData | null = null;

/** Set the snapshot the status entry renders (call before appending/updating). */
export function setStatusData(data: PanelData | null): void {
	currentData = data;
}

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
	// Gate: only the entry holding the current snapshot renders. Older entries
	// (e.g. duplicates accumulated before replacement semantics) are skipped.
	if (entry.data !== currentData) {
		return undefined;
	}

	return {
		render(width: number): string[] {
			if (!currentData) {
				return [truncateToWidth(theme.fg("dim", "[status] 等待数据"), width)];
			}
			return buildPanelRows(currentData).map((row) =>
				truncateToWidth(colorForRole(row.role, theme, row.text), width),
			);
		},
		invalidate(): void {
			// No cached state.
		},
	};
};
