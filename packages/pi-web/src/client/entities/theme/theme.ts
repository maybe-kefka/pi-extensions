/**
 * R26 Themes：主题引擎（唯一测试 seam——纯函数，不碰 DOM）。
 *
 * - THEMES：5 个流行主题（GitHub / One Dark / Dracula / Nord / Tokyo Night）× 浅深双色板，
 *   色板值取自各主题官方公开常量（GitHub Primer / Atom One / Dracula / Nord / tokyonight）
 * - resolveTheme：用户偏好 + 系统色板 → 应用目标 {theme, scheme}
 * - loadPreference / savePreference：localStorage 持久化（缺省 "system"，非法值回退默认）
 * - parseSystemScheme：matchMedia 注入式解析系统深浅
 *
 * DOM 应用（data-theme/.dark 挂载、change 监听）与 UI 面板为薄层，不在此模块。
 */

export type Scheme = "light" | "dark";
export type ThemeName = "github" | "one-dark" | "dracula" | "nord" | "tokyo-night";
export type ThemePreference = { theme: ThemeName; scheme: Scheme | "system" };

export const THEME_NAMES: ThemeName[] = ["github", "one-dark", "dracula", "nord", "tokyo-night"];
export const DEFAULT_PREFERENCE: ThemePreference = { theme: "github", scheme: "system" };
export const PREFERENCE_KEY = "pi-web:theme-preference";

interface LegacyThemeTokens {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  popover: string;
  popoverForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  success: string;
  warning: string;
  border: string;
  input: string;
  ring: string;
  chart1: string;
  chart2: string;
  chart3: string;
  chart4: string;
  chart5: string;
}

export interface ThemeTokens extends LegacyThemeTokens {
  canvas: string;
  panel: string;
  raised: string;
  sunken: string;
  overlay: string;
  sidebar: string;
  editor: string;
  hover: string;
  active: string;
  focus: string;
  danger: string;
  syntaxKeyword: string;
  syntaxType: string;
  syntaxFunction: string;
  syntaxString: string;
  syntaxNumber: string;
  syntaxOperator: string;
  syntaxProperty: string;
  syntaxComment: string;
}

interface SyntaxTokenSource {
  syntaxKeyword: string;
  syntaxType: string;
  syntaxFunction: string;
  syntaxString: string;
  syntaxNumber: string;
  syntaxOperator: string;
  syntaxProperty: string;
  syntaxComment: string;
}

type SurfaceTokenSource = Pick<
  ThemeTokens,
  "canvas" | "panel" | "raised" | "sunken" | "overlay" | "sidebar" | "editor" | "hover" | "active"
>;

export interface ThemeDefinition {
  name: ThemeName;
  label: string;
  light: ThemeTokens;
  dark: ThemeTokens;
}

const PALETTES: Record<ThemeName, { name: ThemeName; label: string; light: LegacyThemeTokens; dark: LegacyThemeTokens }> = {
  github: {
    name: "github",
    label: "GitHub",
    light: {
      background: "#ffffff",
      foreground: "#1f2328",
      card: "#ffffff",
      cardForeground: "#1f2328",
      popover: "#ffffff",
      popoverForeground: "#1f2328",
      primary: "#0969da",
      primaryForeground: "#ffffff",
      secondary: "#f6f8fa",
      secondaryForeground: "#1f2328",
      muted: "#f6f8fa",
      mutedForeground: "#59636e",
      accent: "#0969da",
      accentForeground: "#ffffff",
      destructive: "#d1242f",
      success: "#1a7f37",
      warning: "#9a6700",
      border: "#6e7781",
      input: "#6e7781",
      ring: "#0969da",
      chart1: "#0969da",
      chart2: "#1a7f37",
      chart3: "#d1242f",
      chart4: "#9a6700",
      chart5: "#8250df",
    },
    dark: {
      background: "#0d1117",
      foreground: "#f0f6fc",
      card: "#0d1117",
      cardForeground: "#f0f6fc",
      popover: "#0d1117",
      popoverForeground: "#f0f6fc",
      primary: "#4493f8",
      primaryForeground: "#0d1117",
      secondary: "#151b23",
      secondaryForeground: "#f0f6fc",
      muted: "#151b23",
      mutedForeground: "#9198a1",
      accent: "#4493f8",
      accentForeground: "#0d1117",
      destructive: "#f85149",
      success: "#3fb950",
      warning: "#d29922",
      border: "#8b949e",
      input: "#8b949e",
      ring: "#4493f8",
      chart1: "#4493f8",
      chart2: "#3fb950",
      chart3: "#f85149",
      chart4: "#d29922",
      chart5: "#a371f7",
    },
  },
  "one-dark": {
    name: "one-dark",
    label: "One Dark",
    light: {
      background: "#fafafa",
      foreground: "#383a42",
      card: "#fafafa",
      cardForeground: "#383a42",
      popover: "#fafafa",
      popoverForeground: "#383a42",
      primary: "#2f65d0",
      primaryForeground: "#ffffff",
      secondary: "#f0f0f1",
      secondaryForeground: "#383a42",
      muted: "#f0f0f1",
      mutedForeground: "#545862",
      accent: "#006d9c",
      accentForeground: "#ffffff",
      destructive: "#e45649",
      success: "#50a14f",
      warning: "#986801",
      border: "#6e7781",
      input: "#6e7781",
      ring: "#4078f2",
      chart1: "#4078f2",
      chart2: "#50a14f",
      chart3: "#e45649",
      chart4: "#986801",
      chart5: "#a626a4",
    },
    dark: {
      background: "#282c34",
      foreground: "#abb2bf",
      card: "#282c34",
      cardForeground: "#abb2bf",
      popover: "#282c34",
      popoverForeground: "#abb2bf",
      primary: "#61afef",
      primaryForeground: "#282c34",
      secondary: "#21252b",
      secondaryForeground: "#abb2bf",
      muted: "#21252b",
      mutedForeground: "#abb2bf",
      accent: "#56b6c2",
      accentForeground: "#282c34",
      destructive: "#e06c75",
      success: "#98c379",
      warning: "#e5c07b",
      border: "#8b949e",
      input: "#8b949e",
      ring: "#61afef",
      chart1: "#61afef",
      chart2: "#98c379",
      chart3: "#e06c75",
      chart4: "#e5c07b",
      chart5: "#c678dd",
    },
  },
  dracula: {
    name: "dracula",
    label: "Dracula",
    light: {
      background: "#ffffff",
      foreground: "#44475a",
      card: "#ffffff",
      cardForeground: "#44475a",
      popover: "#ffffff",
      popoverForeground: "#44475a",
      primary: "#6d28d9",
      primaryForeground: "#ffffff",
      secondary: "#f4f4fa",
      secondaryForeground: "#44475a",
      muted: "#f4f4fa",
      mutedForeground: "#44475a",
      accent: "#087f9b",
      accentForeground: "#ffffff",
      destructive: "#ff5555",
      success: "#287a4a",
      warning: "#7a5a00",
      border: "#6e7781",
      input: "#6e7781",
      ring: "#8b5cf6",
      chart1: "#8b5cf6",
      chart2: "#3dbd6e",
      chart3: "#ff5555",
      chart4: "#e6c84f",
      chart5: "#ff79c6",
    },
    dark: {
      background: "#282a36",
      foreground: "#f8f8f2",
      card: "#282a36",
      cardForeground: "#f8f8f2",
      popover: "#282a36",
      popoverForeground: "#f8f8f2",
      primary: "#bd93f9",
      primaryForeground: "#282a36",
      secondary: "#21222c",
      secondaryForeground: "#f8f8f2",
      muted: "#21222c",
      mutedForeground: "#abb2bf",
      accent: "#8be9fd",
      accentForeground: "#282a36",
      destructive: "#ff5555",
      success: "#50fa7b",
      warning: "#f1fa8c",
      border: "#8b949e",
      input: "#8b949e",
      ring: "#bd93f9",
      chart1: "#bd93f9",
      chart2: "#50fa7b",
      chart3: "#ff5555",
      chart4: "#f1fa8c",
      chart5: "#ff79c6",
    },
  },
  nord: {
    name: "nord",
    label: "Nord",
    light: {
      background: "#eceff4",
      foreground: "#2e3440",
      card: "#eceff4",
      cardForeground: "#2e3440",
      popover: "#eceff4",
      popoverForeground: "#2e3440",
      primary: "#3f628f",
      primaryForeground: "#ffffff",
      secondary: "#e5e9f0",
      secondaryForeground: "#2e3440",
      muted: "#e5e9f0",
      mutedForeground: "#4c566a",
      accent: "#81a1c1",
      accentForeground: "#2e3440",
      destructive: "#bf616a",
      success: "#4b6b3c",
      warning: "#7a5f20",
      border: "#6e7781",
      input: "#6e7781",
      ring: "#5e81ac",
      chart1: "#5e81ac",
      chart2: "#a3be8c",
      chart3: "#bf616a",
      chart4: "#ebcb8b",
      chart5: "#b48ead",
    },
    dark: {
      background: "#2e3440",
      foreground: "#eceff4",
      card: "#2e3440",
      cardForeground: "#eceff4",
      popover: "#2e3440",
      popoverForeground: "#eceff4",
      primary: "#88c0d0",
      primaryForeground: "#2e3440",
      secondary: "#3b4252",
      secondaryForeground: "#eceff4",
      muted: "#3b4252",
      mutedForeground: "#aab4c8",
      accent: "#8fbcbb",
      accentForeground: "#2e3440",
      destructive: "#bf616a",
      success: "#a3be8c",
      warning: "#ebcb8b",
      border: "#8b949e",
      input: "#8b949e",
      ring: "#88c0d0",
      chart1: "#88c0d0",
      chart2: "#a3be8c",
      chart3: "#bf616a",
      chart4: "#ebcb8b",
      chart5: "#b48ead",
    },
  },
  "tokyo-night": {
    name: "tokyo-night",
    label: "Tokyo Night",
    light: {
      background: "#e1e2e7",
      foreground: "#1f3f85",
      card: "#e1e2e7",
      cardForeground: "#1f3f85",
      popover: "#e1e2e7",
      popoverForeground: "#1f3f85",
      primary: "#1f5bb8",
      primaryForeground: "#ffffff",
      secondary: "#d7d8dd",
      secondaryForeground: "#173f85",
      muted: "#d7d8dd",
      mutedForeground: "#42558f",
      accent: "#007197",
      accentForeground: "#ffffff",
      destructive: "#f52a65",
      success: "#587539",
      warning: "#8c6c3e",
      border: "#6e7781",
      input: "#6e7781",
      ring: "#2e7de9",
      chart1: "#2e7de9",
      chart2: "#587539",
      chart3: "#f52a65",
      chart4: "#8c6c3e",
      chart5: "#7847bd",
    },
    dark: {
      background: "#1a1b26",
      foreground: "#c0caf5",
      card: "#1a1b26",
      cardForeground: "#c0caf5",
      popover: "#1a1b26",
      popoverForeground: "#c0caf5",
      primary: "#7aa2f7",
      primaryForeground: "#1a1b26",
      secondary: "#16161e",
      secondaryForeground: "#d5defc",
      muted: "#16161e",
      mutedForeground: "#9aa5ce",
      accent: "#7dcfff",
      accentForeground: "#1a1b26",
      destructive: "#f7768e",
      success: "#9ece6a",
      warning: "#e0af68",
      border: "#8b949e",
      input: "#8b949e",
      ring: "#7aa2f7",
      chart1: "#7aa2f7",
      chart2: "#9ece6a",
      chart3: "#f7768e",
      chart4: "#e0af68",
      chart5: "#bb9af7",
    },
  },
};

const SYNTAX_SOURCES: Record<ThemeName, { light: SyntaxTokenSource; dark: SyntaxTokenSource }> = {
  github: {
    light: { syntaxKeyword: "#0969da", syntaxType: "#0969da", syntaxFunction: "#8250df", syntaxString: "#1a7f37", syntaxNumber: "#9a6700", syntaxOperator: "#1f2328", syntaxProperty: "#0969da", syntaxComment: "#59636e" },
    dark: { syntaxKeyword: "#4493f8", syntaxType: "#4493f8", syntaxFunction: "#a371f7", syntaxString: "#3fb950", syntaxNumber: "#d29922", syntaxOperator: "#f0f6fc", syntaxProperty: "#4493f8", syntaxComment: "#9198a1" },
  },
  "one-dark": {
    light: { syntaxKeyword: "#006d9c", syntaxType: "#2f65d0", syntaxFunction: "#a626a4", syntaxString: "#2f6f31", syntaxNumber: "#986801", syntaxOperator: "#383a42", syntaxProperty: "#2f65d0", syntaxComment: "#545862" },
    dark: { syntaxKeyword: "#56b6c2", syntaxType: "#61afef", syntaxFunction: "#c678dd", syntaxString: "#98c379", syntaxNumber: "#e5c07b", syntaxOperator: "#abb2bf", syntaxProperty: "#61afef", syntaxComment: "#abb2bf" },
  },
  dracula: {
    light: { syntaxKeyword: "#087f9b", syntaxType: "#6d28d9", syntaxFunction: "#9b246f", syntaxString: "#287a4a", syntaxNumber: "#7a5a00", syntaxOperator: "#44475a", syntaxProperty: "#6d28d9", syntaxComment: "#44475a" },
    dark: { syntaxKeyword: "#8be9fd", syntaxType: "#bd93f9", syntaxFunction: "#ff79c6", syntaxString: "#50fa7b", syntaxNumber: "#f1fa8c", syntaxOperator: "#f8f8f2", syntaxProperty: "#bd93f9", syntaxComment: "#abb2bf" },
  },
  nord: {
    light: { syntaxKeyword: "#355d84", syntaxType: "#3f628f", syntaxFunction: "#70486c", syntaxString: "#4b6b3c", syntaxNumber: "#7a5f20", syntaxOperator: "#2e3440", syntaxProperty: "#3f628f", syntaxComment: "#4c566a" },
    dark: { syntaxKeyword: "#8fbcbb", syntaxType: "#88c0d0", syntaxFunction: "#c49ac0", syntaxString: "#a3be8c", syntaxNumber: "#ebcb8b", syntaxOperator: "#eceff4", syntaxProperty: "#88c0d0", syntaxComment: "#aab4c8" },
  },
  "tokyo-night": {
    light: { syntaxKeyword: "#005f82", syntaxType: "#1f5bb8", syntaxFunction: "#7847bd", syntaxString: "#456522", syntaxNumber: "#6c4d22", syntaxOperator: "#1f3f85", syntaxProperty: "#1f5bb8", syntaxComment: "#42558f" },
    dark: { syntaxKeyword: "#7dcfff", syntaxType: "#7aa2f7", syntaxFunction: "#bb9af7", syntaxString: "#9ece6a", syntaxNumber: "#e0af68", syntaxOperator: "#c0caf5", syntaxProperty: "#7aa2f7", syntaxComment: "#9aa5ce" },
  },
};

const NEUTRAL_SURFACES: Record<Scheme, SurfaceTokenSource> = {
  light: {
    canvas: "#ffffff",
    panel: "#f9fafb",
    raised: "#ffffff",
    sunken: "#f4f5f7",
    overlay: "#ffffff",
    sidebar: "#f9fafb",
    editor: "#ffffff",
    hover: "#f1f2f4",
    active: "#eaebee",
  },
  dark: {
    canvas: "#111214",
    panel: "#191919",
    raised: "#2b2b2e",
    sunken: "#1f2023",
    overlay: "#242426",
    sidebar: "#191919",
    editor: "#111214",
    hover: "#242426",
    active: "#2a2a2d",
  },
};

function enrichTokens(tokens: LegacyThemeTokens, syntax: SyntaxTokenSource, surfaces: SurfaceTokenSource): ThemeTokens {
  return {
    ...tokens,
    ...surfaces,
    focus: tokens.ring,
    danger: tokens.destructive,
    ...syntax,
  };
}

export const THEMES: Record<ThemeName, ThemeDefinition> = Object.fromEntries(
  THEME_NAMES.map((name) => [name, {
    ...PALETTES[name],
    light: enrichTokens(PALETTES[name].light, SYNTAX_SOURCES[name].light, NEUTRAL_SURFACES.light),
    dark: enrichTokens(PALETTES[name].dark, SYNTAX_SOURCES[name].dark, NEUTRAL_SURFACES.dark),
  }]),
) as Record<ThemeName, ThemeDefinition>;

const kebab = (key: string): string => key.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`).replace(/([a-z])(\d)/g, "$1-$2");

/** Generate the complete theme block consumed by CSS. This is the theme entity's pure CSS seam. */
export function generateThemeCss(theme: ThemeName, scheme: Scheme): string {
  const selector = scheme === "light" ? `[data-theme="${theme}"]` : `[data-theme="${theme}"].dark`;
  const tokens = THEMES[theme][scheme];
  const variables = Object.entries(tokens).map(([key, value]) => `  --${kebab(key)}: ${value};`).join("\n");
  return `${selector} {\n${variables}\n}`;
}

/** Generate all theme blocks in stable theme/scheme order for drift checks. */
export function generateAllThemesCss(): string {
  return THEME_NAMES.flatMap((theme) => [generateThemeCss(theme, "light"), generateThemeCss(theme, "dark")]).join("\n\n") + "\n";
}

export interface ResolvedTheme {
  theme: ThemeName;
  scheme: Scheme;
}

/** 用户偏好 + 系统色板 → 应用目标。scheme=system 时跟随系统色板，否则固定。 */
export function resolveTheme(preference: ThemePreference, systemScheme: Scheme): ResolvedTheme {
  return {
    theme: THEMES[preference.theme] ? preference.theme : DEFAULT_PREFERENCE.theme,
    scheme: preference.scheme === "system" ? systemScheme : preference.scheme,
  };
}

function isThemeName(v: unknown): v is ThemeName {
  return typeof v === "string" && v in THEMES;
}

function isScheme(v: unknown): v is Scheme | "system" {
  return v === "light" || v === "dark" || v === "system";
}

/** 读取持久化偏好：无值/非法 JSON/非法字段均回退默认（不写存储）。 */
export function loadPreference(storage: Pick<Storage, "getItem">): ThemePreference {
  const raw = storage.getItem(PREFERENCE_KEY);
  if (!raw) return DEFAULT_PREFERENCE;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return DEFAULT_PREFERENCE;
    const { theme, scheme } = parsed as Record<string, unknown>;
    if (!isThemeName(theme) || !isScheme(scheme)) return DEFAULT_PREFERENCE;
    return { theme, scheme };
  } catch {
    return DEFAULT_PREFERENCE;
  }
}

export function savePreference(storage: Pick<Storage, "setItem">, preference: ThemePreference): void {
  storage.setItem(PREFERENCE_KEY, JSON.stringify(preference));
}

/** 注入式系统色板解析（测试传 fake matchMedia；浏览器传 window.matchMedia）。 */
export function parseSystemScheme(
  matchMedia: (query: string) => { matches: boolean },
): Scheme {
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
