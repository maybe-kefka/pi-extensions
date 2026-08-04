import { describe, expect, it } from "vitest";
import { extractToken, messageTextOf, messageThinkingOf, messageToolCalls, mimeTypeFor, safeResolveWebPath, tokenEquals } from "../src/http-util.js";
import { join } from "node:path";

describe("messageToolCalls / messageTextOf / messageThinkingOf", () => {
  it("提取 toolCall 块（id/name/arguments）", () => {
    const content = [
      { type: "thinking", thinking: "想" },
      { type: "toolCall", id: "t1", name: "bash", arguments: { command: "ls" } },
      { type: "toolCall", id: "t2", name: "read", arguments: { path: "/x" } },
    ];
    expect(messageToolCalls(content)).toEqual([
      { id: "t1", name: "bash", arguments: { command: "ls" } },
      { id: "t2", name: "read", arguments: { path: "/x" } },
    ]);
  });

  it("无 toolCall → 空数组；缺 id 跳过", () => {
    expect(messageToolCalls([{ type: "text", text: "hi" }])).toEqual([]);
    expect(messageToolCalls([{ type: "toolCall", name: "x", arguments: {} }])).toEqual([]);
    expect(messageToolCalls("str")).toEqual([]);
  });

  it("text 提取过滤空块（thinking+toolCall 无 text → 空串）", () => {
    expect(messageTextOf([{ type: "thinking", thinking: "x" }, { type: "toolCall", id: "t", name: "x", arguments: {} }])).toBe("");
    expect(messageTextOf([{ type: "text", text: "a" }, { type: "text", text: "b" }])).toBe("a\nb");
    expect(messageTextOf("plain")).toBe("plain");
  });

  it("thinking 提取", () => {
    expect(messageThinkingOf([{ type: "thinking", thinking: "思考中" }])).toBe("思考中");
    expect(messageThinkingOf([{ type: "text", text: "x" }])).toBe("");
  });
});

describe("mimeTypeFor", () => {
  it("常见类型", () => {
    expect(mimeTypeFor("/index.html")).toContain("text/html");
    expect(mimeTypeFor("/app.js")).toContain("javascript");
    expect(mimeTypeFor("/styles.css")).toContain("text/css");
  });

  it("无扩展名 / 未知类型 → octet-stream", () => {
    expect(mimeTypeFor("/noext")).toBe("application/octet-stream");
    expect(mimeTypeFor("/x.zzz")).toBe("application/octet-stream");
  });
});

describe("safeResolveWebPath", () => {
  const base = "/srv/web";

  it("根路径 → index.html", () => {
    expect(safeResolveWebPath(base, "/")).toBe(join(base, "index.html"));
    expect(safeResolveWebPath(base, "")).toBe(join(base, "index.html"));
  });

  it("常规路径解析", () => {
    expect(safeResolveWebPath(base, "/app.js")).toBe(join(base, "app.js"));
    expect(safeResolveWebPath(base, "/sub/app.js")).toBe(join(base, "sub", "app.js"));
  });

  it("路径穿越 → null", () => {
    expect(safeResolveWebPath(base, "/../etc/passwd")).toBeNull();
    expect(safeResolveWebPath(base, "/..")).toBeNull();
    expect(safeResolveWebPath(base, "/%2e%2e/etc/passwd")).toBeNull();
  });

  it("编码错误 → null", () => {
    expect(safeResolveWebPath(base, "/%zz")).toBeNull();
  });

  it("剥离 query/fragment", () => {
    expect(safeResolveWebPath(base, "/app.js?x=1")).toBe(join(base, "app.js"));
    expect(safeResolveWebPath(base, "/app.js#top")).toBe(join(base, "app.js"));
  });
});

describe("tokenEquals", () => {
  it("相等/不等/长度不同", () => {
    expect(tokenEquals("abc123", "abc123")).toBe(true);
    expect(tokenEquals("abc123", "abc124")).toBe(false);
    expect(tokenEquals("abc123", "abc")).toBe(false);
    expect(tokenEquals("", "")).toBe(true);
  });
});

describe("extractToken", () => {
  it("从 query 提取 token", () => {
    expect(extractToken("/?token=xyz")).toBe("xyz");
    expect(extractToken("/app.js?token=a%20b")).toBe("a b");
    expect(extractToken("/?foo=1&token=xyz")).toBe("xyz");
  });

  it("无 token / 编码错误 → null", () => {
    expect(extractToken("/")).toBeNull();
    expect(extractToken("/?foo=1")).toBeNull();
    expect(extractToken("/?token=%zz")).toBeNull();
  });
});
