/**
 * 主题 DOM 应用（薄层，不单测——冒烟验证）：
 * 挂载 data-theme + .dark 到根元素；系统深浅变化监听。
 * 唯一 seam（主题引擎纯函数）见 entities/theme/theme.ts。
 */
import { loadPreference, parseSystemScheme, resolveTheme, type ThemePreference } from "@/entities/theme";

/** 应用当前偏好（缺省读 localStorage）到 documentElement。 */
export function applyTheme(preference?: ThemePreference): void {
  const pref = preference ?? loadPreference(window.localStorage);
  const scheme = parseSystemScheme((query) => window.matchMedia(query));
  const resolved = resolveTheme(pref, scheme);
  const root = document.documentElement;
  root.dataset.theme = resolved.theme;
  root.classList.toggle("dark", resolved.scheme === "dark");
}

/** 订阅系统深浅变化（跟随系统模式下实时跟随）。返回取消订阅函数。 */
export function watchSystemScheme(onChange: () => void): () => void {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
