/**
 * Widget renderer for /status snapshots.
 *
 * Renders the full panel as a fixed widget above the editor (SPEC's original
 * design): setWidget with the same key replaces the previous panel, so there
 * is never any accumulation, and the panel stays on screen — every /status
 * run visibly refreshes it in place (no scrolling needed, no transcript
 * history to dig through).
 *
 * The returned component is non-caching and reads the module snapshot
 * (setStatusData) on every frame, so later /status runs update it in place.
 */

import type { Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, type Component } from "@earendil-works/pi-tui";
import { buildPanelRows, type PanelData, type PanelRowRole } from "./format.js";

/** setWidget key (also used for the footer status). */
export const STATUS_WIDGET_KEY = "pi-status";

let currentData: PanelData | null = null;

/** Set the live snapshot the widget renders (call before setWidget). */
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

/** Build the widget component for the current snapshot. */
export function renderStatusWidget(theme: Theme): Component {
	return {
		render(width: number): string[] {
			const data = currentData;
			if (!data) {
				return [truncateToWidth(theme.fg("dim", "[status] 运行 /status 查看上下文占用"), width)];
			}
			return buildPanelRows(data).map((row) =>
				truncateToWidth(colorForRole(row.role, theme, row.text), width),
			);
		},
		invalidate(): void {
			// No cached state.
		},
	};
}
