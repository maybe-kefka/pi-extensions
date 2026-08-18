/**
 * 主题 CSS 生成器：从 entities/theme/theme.ts 单数据源生成 5 主题 × 浅深 CSS 变量块。
 *
 * 用法：node scripts/gen-theme-css.mjs > /tmp/theme-blocks.css
 * 然后把输出粘贴到 src/client/app/index.css 的「R26 Themes」注释块处
 * （或直接重写该块——块结构固定为 [data-theme="X"] / [data-theme="X"].dark 两组）。
 *
 * 为何存在：theme.ts 的 token 是唯一数据源；index.css 中对应变量块由此脚本生成，
 * 新增主题/改色板只改 theme.ts，再跑本脚本同步 CSS，避免双份手写漂移。
 */
import { generateAllThemesCss } from "../src/client/entities/theme/theme.ts";

console.log(generateAllThemesCss());
