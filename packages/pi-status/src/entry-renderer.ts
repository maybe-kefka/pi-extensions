/**
 * Chat-transcript renderer for /status snapshots.
 *
 * Replacement semantics: the command appends at most ONE session entry (type
 * STATUS_ENTRY_TYPE) per session leaf path, so the conversation never fills
 * with status entries. The rendered component is non-caching and reads the
 * module snapshot (setStatusData) on every frame — later /status runs refresh
 * the SAME panel in place.
 *
 * Fallback: on replay (app start / /reload) the module snapshot may not be
 * restored yet (reload rebuilds the transcript BEFORE session_start fires), so
 * render() falls back to the entry's own persisted data — the panel is never
 * blank and never duplicated (only one entry of this type can exist).
 *
 * Entries never participate in LLM context.
 */

import type { EntryRenderer, Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";
import { buildPanelRows, type PanelData, type PanelRowRole } from "./format.js";

/**
 * v2 customType. The old "status-panel" entries accumulated before replacement
 * semantics have no renderer for this type and are silently skipped.
 */
export const STATUS_ENTRY_TYPE = "status";

let currentData: PanelData | null = null;

/** Set the live snapshot the status entry renders (call before appending/updating). */
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
	return {
		render(width: number): string[] {
			const data = currentData ?? entry.data;
			if (!data) {
				return [truncateToWidth(theme.fg("dim", "[status] 等待数据"), width)];
			}
			return buildPanelRows(data).map((row) =>
				truncateToWidth(colorForRole(row.role, theme, row.text), width),
			);
		},
		invalidate(): void {
			// No cached state.
		},
	};
};
