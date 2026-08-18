/**
 * 主题引擎测试（唯一 seam——纯函数，不碰 DOM）：
 * THEMES 定义完整性 / resolveTheme 组合 / 偏好持久化 / 系统色板解析。
 * 先例：stream.ts reducer、web-ask.ts registry 纯逻辑测试。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  DEFAULT_PREFERENCE,
  generateThemeCss,
  generateAllThemesCss,
  THEMES,
  THEME_NAMES,
  loadPreference,
  parseSystemScheme,
  resolveTheme,
  savePreference,
  type ThemeTokens,
} from "./theme.js";

const TOKEN_KEYS: (keyof ThemeTokens)[] = [
  "background",
  "foreground",
  "card",
  "cardForeground",
  "popover",
  "popoverForeground",
  "primary",
  "primaryForeground",
  "secondary",
  "secondaryForeground",
  "muted",
  "mutedForeground",
  "accent",
  "accentForeground",
  "destructive",
  "success",
  "warning",
  "border",
  "input",
  "ring",
  "chart1",
  "chart2",
  "chart3",
  "chart4",
  "chart5",
  "canvas",
  "panel",
  "raised",
  "sunken",
  "overlay",
  "sidebar",
  "editor",
  "hover",
  "active",
  "focus",
  "danger",
  "syntaxKeyword",
  "syntaxType",
  "syntaxFunction",
  "syntaxString",
  "syntaxNumber",
  "syntaxOperator",
  "syntaxProperty",
  "syntaxComment",
];

function makeStorage(init: Record<string, string> = {}) {
  const map = new Map(Object.entries(init));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    entries: () => [...map.entries()],
  };
}

describe("THEMES 定义完整性", () => {
  it("公开确定性的 CSS 生成契约", () => {
    expect(generateThemeCss("github", "light")).toContain(
      '[data-theme="github"] {\n  --background: #ffffff;\n',
    );
    expect(generateThemeCss("github", "light")).toContain("--chart-1: #0969da;");
  });

  it("提交的主题 CSS 与生成结果无漂移", () => {
    const css = readFileSync(new URL("../../app/index.css", import.meta.url), "utf8");
    const start = css.indexOf('[data-theme="github"]');
    const end = css.indexOf("@theme inline", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(css.slice(start, end).trim()).toBe(generateAllThemesCss().trim());
  });

  it("所有主题的文字与关键状态组合达到 WCAG AA", () => {
    const contrast = (foreground: string, background: string) => {
      const channel = (hex: string, offset: number) => {
        const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
        return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      };
      const luminance = (hex: string) => 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
      const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
      return (light + 0.05) / (dark + 0.05);
    };
    const blend = (foreground: string, background: string, alpha: number) => {
      const channel = (hex: string, offset: number) => Number.parseInt(hex.slice(offset, offset + 2), 16);
      return `#${[1, 3, 5].map((offset) => Math.round(channel(foreground, offset) * alpha + channel(background, offset) * (1 - alpha)).toString(16).padStart(2, "0")).join("")}`;
    };
    const pairs: [keyof ThemeTokens, keyof ThemeTokens, number][] = [
      ["foreground", "background", 4.5],
      ["mutedForeground", "secondary", 4.5],
      ["primaryForeground", "primary", 4.5],
      ["accentForeground", "accent", 4.5],
      ["destructive", "background", 3],
      ["success", "background", 3],
      ["warning", "background", 3],
      ["foreground", "card", 4.5],
      ["foreground", "popover", 4.5],
      ["foreground", "panel", 4.5],
      ["mutedForeground", "muted", 4.5],
      ["secondaryForeground", "secondary", 4.5],
      ["border", "background", 3],
      ["input", "background", 3],
      ["ring", "background", 3],
    ];
    const failures: string[] = [];
    for (const name of THEME_NAMES) {
      for (const scheme of ["light", "dark"] as const) {
        const tokens = THEMES[name][scheme];
        for (const [foreground, background, threshold] of pairs) {
          if (contrast(tokens[foreground], tokens[background]) < threshold) failures.push(`${name}/${scheme}/${foreground}/${background}=${contrast(tokens[foreground], tokens[background]).toFixed(2)}<${threshold}`);
        }
        const mutedSurface = blend(tokens.muted, tokens.background, 0.5);
        if (contrast(tokens.mutedForeground, mutedSurface) < 4.5) failures.push(`${name}/${scheme}/mutedForeground/muted-alpha=${contrast(tokens.mutedForeground, mutedSurface).toFixed(2)}<4.5`);
      }
    }
    expect(failures).toEqual([]);
  });
  it("包含 5 个主题：github/one-dark/dracula/nord/tokyo-night", () => {
    expect(THEME_NAMES).toEqual(["github", "one-dark", "dracula", "nord", "tokyo-night"]);
  });

  it("每个主题 light/dark 两套色板、token 齐全且为 #hex 格式", () => {
    for (const name of THEME_NAMES) {
      const t = THEMES[name];
      expect(t.label).toBeTruthy();
      for (const scheme of ["light", "dark"] as const) {
        const tokens = t[scheme];
        for (const key of TOKEN_KEYS) {
          expect(tokens[key], `${name}/${scheme}/${key}`).toMatch(/^#[0-9a-f]{6}$/i);
        }
      }
    }
  });

  it("同一主题浅深背景互不相同（色板确实有差异）", () => {
    for (const name of THEME_NAMES) {
      expect(THEMES[name].light.background).not.toBe(THEMES[name].dark.background);
    }
  });
});

describe("resolveTheme", () => {
  it("全组合矩阵：5 主题 × 3 偏好 × 2 系统色板", () => {
    for (const theme of THEME_NAMES) {
      // scheme=system → 跟随系统色板
      expect(resolveTheme({ theme, scheme: "system" }, "dark")).toEqual({ theme, scheme: "dark" });
      expect(resolveTheme({ theme, scheme: "system" }, "light")).toEqual({ theme, scheme: "light" });
      // 固定浅/深 → 忽略系统色板
      expect(resolveTheme({ theme, scheme: "light" }, "dark")).toEqual({ theme, scheme: "light" });
      expect(resolveTheme({ theme, scheme: "light" }, "light")).toEqual({ theme, scheme: "light" });
      expect(resolveTheme({ theme, scheme: "dark" }, "light")).toEqual({ theme, scheme: "dark" });
      expect(resolveTheme({ theme, scheme: "dark" }, "dark")).toEqual({ theme, scheme: "dark" });
    }
  });

  it("默认偏好 = github + system", () => {
    expect(DEFAULT_PREFERENCE).toEqual({ theme: "github", scheme: "system" });
    expect(resolveTheme(DEFAULT_PREFERENCE, "dark")).toEqual({ theme: "github", scheme: "dark" });
  });
});

describe("偏好持久化", () => {
  const KEY = "pi-web:theme-preference";

  it("无存储值时返回默认偏好（不写存储）", () => {
    const storage = makeStorage();
    expect(loadPreference(storage)).toEqual(DEFAULT_PREFERENCE);
    expect(storage.entries()).toHaveLength(0);
  });

  it("保存 → 读出为同一偏好（round-trip）", () => {
    const storage = makeStorage();
    const pref = { theme: "tokyo-night" as const, scheme: "dark" as const };
    savePreference(storage, pref);
    expect(storage.entries()[0][0]).toBe(KEY);
    expect(loadPreference(storage)).toEqual(pref);
  });

  it("非法 JSON / 非法主题名 / 非法 scheme 均回退默认偏好", () => {
    expect(loadPreference(makeStorage({ [KEY]: "not-json" }))).toEqual(DEFAULT_PREFERENCE);
    expect(loadPreference(makeStorage({ [KEY]: JSON.stringify({ theme: "solarized", scheme: "dark" }) }))).toEqual(
      DEFAULT_PREFERENCE,
    );
    expect(loadPreference(makeStorage({ [KEY]: JSON.stringify({ theme: "nord", scheme: "blue" }) }))).toEqual(
      DEFAULT_PREFERENCE,
    );
  });
});

describe("parseSystemScheme", () => {
  it("matchMedia matches=true → dark；false → light", () => {
    expect(parseSystemScheme(() => ({ matches: true }))).toBe("dark");
    expect(parseSystemScheme(() => ({ matches: false }))).toBe("light");
  });

  it("传入查询串为 prefers-color-scheme: dark", () => {
    let seen = "";
    parseSystemScheme((q) => {
      seen = q;
      return { matches: false };
    });
    expect(seen).toBe("(prefers-color-scheme: dark)");
  });
});
