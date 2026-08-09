# 01 — theme-engine

**What to build:** pi-web 的主题引擎与 CSS 变量接入。5 种主题（GitHub / One Dark / Dracula / Nord / Tokyo Night）各含浅深两套完整色板；默认跟随系统（无用户选择时按 `prefers-color-scheme`），用户选择持久化到 localStorage；打开控制台即按正确主题/深浅渲染（跟随系统模式下系统深浅变化实时跟随，无需刷新）。此 ticket 完成后无任何 UI 选择入口——默认行为即可用。

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] 主题引擎纯函数：`THEMES` 定义（5 主题 × light/dark 全套 shadcn token）+ `resolveTheme(preference, systemScheme)` 全组合正确
- [ ] 每个主题 light/dark 的 shadcn token 集完整（无缺漏 token）
- [ ] 偏好持久化：localStorage 读写；无存储值 = "system"（不写入）；非法值回退 "system"
- [ ] 系统色板检测（注入式 matchMedia 解析 + change 订阅）
- [ ] DOM 应用：根元素 `data-theme` + `.dark` class 随解析结果挂载/更新
- [ ] CSS：5 主题 × 浅（`:root` 覆盖）/深（`.dark` 覆盖）变量块接入；默认 zinc 兜底保留
- [ ] `npm test` + `npm run typecheck` 全绿

## Blocked by

None — can start immediately.
