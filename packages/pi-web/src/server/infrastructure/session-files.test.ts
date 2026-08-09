import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { deleteSessionFile, validateDeletableSession } from "./session-files.js";

describe("validateDeletableSession", () => {
  const dir = "/tmp/pi-sessions";

  it("合法：绝对 .jsonl 路径且非当前会话", () => {
    expect(validateDeletableSession(dir, join(dir, "abc.jsonl"), join(dir, "other.jsonl"))).toEqual({ ok: true });
  });

  it("当前会话 → 拒绝", () => {
    expect(validateDeletableSession(dir, join(dir, "abc.jsonl"), join(dir, "abc.jsonl"))).toEqual({
      ok: false,
      error: "不能删除当前会话",
    });
  });

  it("非绝对路径 → 拒绝", () => {
    expect(validateDeletableSession(dir, "abc.jsonl", null)).toEqual({ ok: false, error: "会话路径必须是绝对路径" });
  });

  it("非 .jsonl 扩展名 → 拒绝", () => {
    expect(validateDeletableSession(dir, join(dir, "abc.txt"), null)).toEqual({
      ok: false,
      error: "只支持删除 .jsonl 会话文件",
    });
  });

  it("路径穿越（目录外）→ 拒绝", () => {
    expect(validateDeletableSession(dir, "/etc/passwd.jsonl", null)).toEqual({
      ok: false,
      error: "会话路径不在会话目录内",
    });
    expect(validateDeletableSession(dir, join(dir, "..", "evil.jsonl"), null)).toEqual({
      ok: false,
      error: "会话路径不在会话目录内",
    });
  });

  it("空路径 → 拒绝", () => {
    expect(validateDeletableSession(dir, "", null)).toEqual({ ok: false, error: "会话路径不能为空" });
    expect(validateDeletableSession(dir, "   ", null)).toEqual({ ok: false, error: "会话路径不能为空" });
  });

  it("当前会话路径带 ../ 归一化后仍能识别", () => {
    // /tmp/pi-sessions/../pi-sessions/abc.jsonl 归一化后等于当前会话 → 拒绝
    const sneaky = join(dir, "..", "pi-sessions", "abc.jsonl");
    expect(validateDeletableSession(dir, sneaky, join(dir, "abc.jsonl"))).toEqual({ ok: false, error: "不能删除当前会话" });
  });
});

describe("deleteSessionFile", () => {
  it("删除成功", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "piweb-del-"));
    try {
      const file = join(tmp, "a.jsonl");
      writeFileSync(file, "{}");
      const r = await deleteSessionFile(tmp, file, join(tmp, "b.jsonl"));
      expect(r).toEqual({ ok: true });
      expect(() => require("node:fs").statSync(file)).toThrow();
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("校验失败不删除（当前会话）", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "piweb-del-"));
    try {
      const file = join(tmp, "a.jsonl");
      writeFileSync(file, "{}");
      const r = await deleteSessionFile(tmp, file, file);
      expect(r.ok).toBe(false);
      expect(() => require("node:fs").statSync(file)).not.toThrow();
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("文件不存在 → 失败错误（不 throw）", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "piweb-del-"));
    try {
      const r = await deleteSessionFile(tmp, join(tmp, "missing.jsonl"), null);
      expect(r.ok).toBe(false);
      expect((r as { error: string }).error).toMatch(/删除失败/);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
