# Themes 迭代 SPEC

> 依据 `/skill:to-spec` 生成（seams 已与用户确认：唯一测试缝 = 主题引擎纯函数）。

## Problem Statement

pi-web 控制台目前恒定浅色（shadcn zinc 默认色板），既不跟随系统深浅色、也没有任何主题选择能力；代码高亮（highlight.js 硬编码 github-dark）与 toast 通知（sonner 硬编码 `theme="dark"`）与页面明暗脱节——浅色页面配暗色 toast 与深色代码块，视觉割裂。用户希望界面像主流编辑器/终端（VS Code、Warp、Zed）一样支持流行主题与系统深浅跟随。

## Solution

pi-web 提供 5 种网上流行主题（GitHub / One Dark / Dracula / Nord / Tokyo Night），每个主题含浅、深两套完整色板；**默认跟随系统**（`prefers-color-scheme`，用户无选择时）；侧边栏「外观」面板可切换主题与强制浅/深；用户选择持久化（localStorage），刷新不丢；代码高亮与 toast 配色随主题联动。

## User Stories

1. 作为用户，我希望默认跟随系统深浅色，这样我不需要手动切换，系统夜晚模式时控制台自动变暗
2. 作为用户，我希望从 GitHub / One Dark / Dracula / Nord / Tokyo Night 五种流行主题中选择，这样界面风格符合我的审美
3. 作为用户，我希望每个主题都有浅色与深色变体，这样无论系统处于什么模式界面都协调不刺眼
4. 作为用户，我希望主题与深浅选择被记住，这样刷新/重开浏览器后不用重新设置
5. 作为用户，我希望代码高亮配色跟随当前主题，这样代码块与整体界面不割裂
6. 作为用户，我希望 toast 通知配色跟随当前主题，这样通知不再突兀
7. 作为用户，我希望侧边栏有「外观」面板，这样切换入口与「模型 / 思考」同级、直观好找
8. 作为用户，我希望「跟随系统」模式下系统深浅变化时界面实时跟随，这样无需刷新或手动操作
9. 作为用户，我希望手动选定浅/深后不被系统变化打扰，这样我对界面有确定性的控制
10. 作为用户，我希望切换主题即时生效，这样我能快速对比不同主题效果
11. 作为用户，我希望恢复「跟随系统」能回到默认行为，这样误操作可撤销
12. 作为用户，我希望主题切换不丢失当前会话与消息，这样切换是纯外观操作

## Implementation Decisions

- **主题引擎纯函数模块**（唯一测试 seam）：`THEMES` 定义（5 主题 × `{light, dark}` 完整 shadcn token 集：background/foreground/card/popover/primary/secondary/muted/accent/destructive/success/warning/border/input/ring + chart-1..5）；`ThemePreference = "system" | ThemeName`；`resolveTheme(preference, systemScheme) → { theme, scheme }`（"system" 用系统色板，否则用该主题对应色板）；偏好持久化 localStorage（key `pi-web:theme-preference`，无值时视为 "system" 且不写入）；系统色板检测注入式（`matchMedia` 以函数参数传入，便于测试）
- **DOM 应用（薄层）**：根元素挂 `data-theme="<name>"` attribute + scheme 为 dark 时挂 `.dark` class；监听 `matchMedia("(prefers-color-scheme: dark)")` change 事件实时刷新
- **CSS 结构**：现有 `:root` zinc 变量作为默认（= GitHub light 语义），新增 `[data-theme="github"]`、`[data-theme="one-dark"]`、`[data-theme="dracula"]`、`[data-theme="nord"]`、`[data-theme="tokyo-night"]` 各一组 `:root`（浅）变量覆盖 + 对应 `.dark` 下深色覆盖；`.dark` class 全局控制深浅维度
- **token 值来源**：各主题官方色板（GitHub Primer、Atom One Dark/Light、Dracula、Nord、tokyonight-vscode-theme），hex 值；相对颜色语法 `oklch(from var(--primary) ...)`（bubble 气泡派生色）对 hex 输入合法（CSS Color 4 相对颜色接受任意 `<color>`），无需改派生色逻辑
- **UI（薄层）**：侧边栏「模型 / 思考」面板下方新增「外观」面板——主题 Select（5 主题，默认 GitHub）+ 深浅三态 Select（跟随系统 / 浅色 / 深色，默认跟随系统）；选择即写 localStorage 并应用
- **联动修复**：sonner `Toaster` 的 `theme` 改为跟随当前 scheme（去硬编码 `"dark"`）；highlight.js 高亮配色改为随主题的 CSS 变量（替换硬编码 `github-dark.css` 导入，代码块配色由主题 token 派生）
- **默认行为**：无 localStorage 时 = 跟随系统（不写存储）；首启即响应系统深浅

## Testing Decisions

- 好测试的标准：只测外部行为（输入偏好 + 系统色板 → 输出应用目标；读写偏好 → 存储内容），不测 DOM 实现
- **唯一测试模块：主题引擎**（纯函数）——覆盖：`resolveTheme` 全组合（5 主题 × 3 偏好 × 2 系统色板）、每个主题 light/dark token 完整性（全套 shadcn token 存在）、localStorage 读写与缺省行为（注入 fake storage）、系统色板解析（注入 fake matchMedia）
- 先例：`stream.ts` reducer / `web-ask.ts` registry 纯逻辑测试（本仓库既有模式）
- DOM 应用、外观面板、hljs/toast 联动为薄层：不单测，浏览器冒烟验证（切主题看变色/高亮/toast/持久化）

## Out of Scope

- pi TUI 主题 JSON（`.pi/themes/*.json`）——前端主题稳定后另行迭代
- 用户自定义主题编辑器/导入
- 主题跨设备同步（服务端存储）
- 其他流行主题（Solarized / Gruvbox / Monokai 等）——首期 5 个，结构支持后续追加
- 主题切换动画

## Further Notes

- 现有 `.dark` zinc 变量块保留为兜底（未匹配 `data-theme` 时的默认）
- 主题名与 Select 显示名：GitHub / One Dark / Dracula / Nord / Tokyo Night（`theme` key 用 kebab-case：`github` / `one-dark` / `dracula` / `nord` / `tokyo-night`）
- 深浅三态是全局维度（与主题正交）：跟随系统时按 `prefers-color-scheme` 实时切换
