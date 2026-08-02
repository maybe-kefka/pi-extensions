/**
 * Full-screen overlay component for the /status panel (TUI mode only).
 *
 * Renders the pre-assembled panel lines via `render(width)`; unlike
 * `setWidget`, the overlay has no MAX_WIDGET_LINES limit. Esc / Ctrl+C closes.
 */

import { matchesKey, truncateToWidth } from "@earendil-works/pi-tui";

export interface StatusOverlayOptions {
	/** Pre-assembled panel lines (from buildPanelLines). */
	lines: string[];
	/** Called when the user closes the overlay (Esc / Ctrl+C). */
	onClose: () => void;
}

export class StatusOverlay {
	private lines: string[];
	private onClose: () => void;

	constructor(options: StatusOverlayOptions) {
		this.lines = options.lines;
		this.onClose = options.onClose;
	}

	invalidate(): void {
		// Static content; nothing to invalidate.
	}

	handleInput(data: string): void {
		if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) {
			this.onClose();
		}
	}

	render(width: number): string[] {
		return this.lines.map((line) => truncateToWidth(line, width));
	}
}
