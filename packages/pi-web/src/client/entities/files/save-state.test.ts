import { describe, expect, it } from "vitest";
import {
  editContent,
  initialEditState,
  markConflict,
  markSaved,
  markSaving,
  reloadFromDisk,
  resolveConflictOverwrite,
  type EditState,
} from "./save-state.js";
import type { OpenedFile } from "./editor.js";

const file: OpenedFile = {
  path: "a.ts",
  name: "a.ts",
  content: "old",
  mode: "text",
  size: 3,
  mtimeMs: 100,
  hash: "h1",
};

describe("编辑保存状态机", () => {
  it("初始态：内容=磁盘，不脏", () => {
    const s = initialEditState(file);
    expect(s.content).toBe("old");
    expect(s.dirty).toBe(false);
    expect(s.savedHash).toBe("h1");
  });

  it("编辑内容 → 脏", () => {
    const s = editContent(initialEditState(file), "new");
    expect(s.content).toBe("new");
    expect(s.dirty).toBe(true);
  });

  it("改回已保存内容 → 不脏（哈希未变）", () => {
    const s = editContent(initialEditState(file), "old");
    expect(s.dirty).toBe(false);
  });

  it("保存中标记 → 保存成功（新快照）→ 不脏 + expected 更新", () => {
    let s = editContent(initialEditState(file), "new");
    s = markSaving(s);
    expect(s.saving).toBe(true);
    s = markSaved(s, { hash: "h2", mtimeMs: 200 });
    expect(s.dirty).toBe(false);
    expect(s.saving).toBe(false);
    expect(s.savedHash).toBe("h2");
    // 保存成功后继续编辑 → 以新快照为基准
    s = editContent(s, "newer");
    expect(s.dirty).toBe(true);
  });

  it("冲突 → 保留编辑内容 + 展示 conflict", () => {
    let s = editContent(initialEditState(file), "new");
    s = markSaving(s);
    s = markConflict(s, { hash: "hX", mtimeMs: 999 });
    expect(s.conflict?.current).toEqual({ hash: "hX", mtimeMs: 999 });
    expect(s.content).toBe("new");
    expect(s.saving).toBe(false);
  });

  it("覆盖：expected 更新为磁盘当前快照，冲突清除，编辑保留", () => {
    let s = editContent(initialEditState(file), "new");
    s = markConflict(s, { hash: "hX", mtimeMs: 999 });
    s = resolveConflictOverwrite(s);
    expect(s.conflict).toBeNull();
    expect(s.savedHash).toBe("hX");
    expect(s.savedMtimeMs).toBe(999);
    expect(s.content).toBe("new");
  });

  it("放弃/重新加载：恢复磁盘内容与快照", () => {
    let s = editContent(initialEditState(file), "new");
    s = markConflict(s, { hash: "hX", mtimeMs: 999 });
    const nextFile = { ...file, content: "external-change", hash: "hY", mtimeMs: 2000 };
    s = reloadFromDisk(s, nextFile);
    expect(s.content).toBe("external-change");
    expect(s.dirty).toBe(false);
    expect(s.conflict).toBeNull();
    expect(s.savedHash).toBe("hY");
  });
});
