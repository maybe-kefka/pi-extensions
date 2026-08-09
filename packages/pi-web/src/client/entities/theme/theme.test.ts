/**
 * 主题引擎测试（唯一 seam——纯函数，不碰 DOM）：
 * THEMES 定义完整性 / resolveTheme 组合 / 偏好持久化 / 系统色板解析。
 * 先例：stream.ts reducer、web-ask.ts registry 纯逻辑测试。
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_PREFERENCE,
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
  it("scheme=system 时跟随系统色板，主题保持用户选择", () => {
    expect(resolveTheme({ theme: "dracula", scheme: "system" }, "dark")).toEqual({
      theme: "dracula",
      scheme: "dark",
    });
    expect(resolveTheme({ theme: "dracula", scheme: "system" }, "light")).toEqual({
      theme: "dracula",
      scheme: "light",
    });
  });

  it("scheme 固定浅/深时忽略系统色板", () => {
    expect(resolveTheme({ theme: "nord", scheme: "light" }, "dark")).toEqual({
      theme: "nord",
      scheme: "light",
    });
    expect(resolveTheme({ theme: "nord", scheme: "dark" }, "light")).toEqual({
      theme: "nord",
      scheme: "dark",
    });
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
