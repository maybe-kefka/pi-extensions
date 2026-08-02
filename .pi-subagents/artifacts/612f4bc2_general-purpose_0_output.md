**Report**

**(1) Recent commits (git log --oneline | head -3):**
- `ae10472` T10: YAML-style resource blocks + auto-collapse on next input
- `715786e` T9: revert to widget approach — fixed panel, visible on every /status
- `e79ac17` T8 fix: status panel not rendering after /reload (replay-before-restore ordering)

**(2) Exported names in `packages/pi-status/src/widget.ts`:**
- `STATUS_WIDGET_KEY` — line 13 (exported const)
- `setStatusData` — line 17 (exported function)
- `renderStatusTheme` — line 38 (exported function)

**(3) Tool confirmation:** Yes — bash (`git log`) succeeded and `read` returned the full file.