/**
 * HTTP 静态资源与 token 校验的纯函数工具。
 * SPEC §5 / §7：MIME 映射、路径穿越防护、token 比对。
 */

import { timingSafeEqual } from "node:crypto";
import { normalize, resolve, sep } from "node:path";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
};

export function mimeTypeFor(pathname: string): string {
  const idx = pathname.lastIndexOf(".");
  if (idx === -1) return "application/octet-stream";
  return MIME[pathname.slice(idx).toLowerCase()] ?? "application/octet-stream";
}

/**
 * 把 URL pathname 安全解析为 webDir 内的绝对路径。
 * "/" → index.html；路径穿越 → null；解码失败 → null。
 */
export function safeResolveWebPath(baseDir: string, pathname: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const cleaned = decoded.split("?")[0].split("#")[0];
  const rel = cleaned === "" || cleaned === "/" ? "index.html" : cleaned.replace(/^\/+/, "");
  const normalized = normalize(rel);
  if (normalized === ".." || normalized.startsWith(`..${sep}`)) return null;
  const full = resolve(baseDir, normalized);
  if (full !== baseDir && !full.startsWith(baseDir + sep)) return null;
  return full;
}

/** token 比对（长度先检，内容走 timing-safe） */
export function tokenEquals(expected: string, actual: string): boolean {
  const e = Buffer.from(expected);
  const a = Buffer.from(actual);
  if (e.length !== a.length) return false;
  return timingSafeEqual(e, a);
}

/** 从请求 URL 中提取 ?token= 查询参数 */
export function extractToken(rawUrl: string): string | null {
  const idx = rawUrl.indexOf("?");
  if (idx === -1) return null;
  const search = rawUrl.slice(idx + 1);
  for (const part of search.split("&")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq) === "token") {
      try {
        return decodeURIComponent(part.slice(eq + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}
