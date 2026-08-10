import { describe, expect, it } from "vitest";
import {
  activateTab,
  chatTab,
  closeTab,
  diffPathOf,
  hasDirty,
  initialState,
  openDiffTab,
  openFile,
  promotePreview,
  setDirty,
  tabDirty,
  type WorkspaceState,
} from "./tabs.js";

describe("workspace tab 状态机", () => {
  it("初始态：仅聊天 tab 且激活", () => {
    const s = initialState();
    expect(s.tabs).toEqual([{ kind: "chat" }]);
    expect(s.active).toBe("chat");
  });

  it("打开新文件：追加 tab 并激活", () => {
    const s = openFile(initialState(), "a.ts", "a.ts");
    expect(s.tabs.map((t) => (t.kind === "file" ? t.path : "chat"))).toEqual(["chat", "a.ts"]);
    expect(s.active).toBe("a.ts");
  });

  it("打开已打开文件：不重复追加，仅激活", () => {
    let s = openFile(initialState(), "a.ts", "a.ts");
    s = openFile(s, "b.ts", "b.ts");
    s = openFile(s, "a.ts", "a.ts");
    expect(s.tabs.filter((t) => t.kind === "file")).toHaveLength(2);
    expect(s.active).toBe("a.ts");
  });

  it("切换 tab：聊天与文件互切", () => {
    let s = openFile(initialState(), "a.ts", "a.ts");
    s = activateTab(s, "chat");
    expect(s.active).toBe("chat");
    s = activateTab(s, "a.ts");
    expect(s.active).toBe("a.ts");
  });

  it("关闭激活文件 tab：激活右侧相邻（无则左侧）", () => {
    let s = openFile(initialState(), "a.ts", "a.ts");
    s = openFile(s, "b.ts", "b.ts");
    s = closeTab(s, "b.ts");
    expect(s.active).toBe("a.ts");
    // 关闭 a（激活）→ 右侧无 → 左侧（chat）
    s = closeTab(s, "a.ts");
    expect(s.active).toBe("chat");
  });

  it("关闭非激活 tab：激活不变", () => {
    let s = openFile(initialState(), "a.ts", "a.ts");
    s = openFile(s, "b.ts", "b.ts");
    s = activateTab(s, "a.ts");
    s = closeTab(s, "b.ts");
    expect(s.active).toBe("a.ts");
  });

  it("聊天 tab 常驻：closeTab 对 chat 无操作", () => {
    const s = closeTab(initialState(), "chat");
    expect(s.tabs).toHaveLength(1);
    expect(s.active).toBe("chat");
  });

  it("最后一个文件关闭后回聊天", () => {
    let s = openFile(initialState(), "a.ts", "a.ts");
    s = closeTab(s, "a.ts");
    expect(s.active).toBe("chat");
    expect(s.tabs).toEqual([{ kind: "chat" }]);
  });

  it("chatTab 标识常量", () => {
    expect(chatTab()).toBe("chat");
  });

  it("文件浏览态可激活（无文件 tab 时）", () => {
    const s = activateTab(initialState(), "files");
    expect(s.active).toBe("files");
  });

  it("打开文件后浏览态切到文件", () => {
    const s = openFile(activateTab(initialState(), "files"), "a.ts", "a.ts");
    expect(s.active).toBe("a.ts");
  });

  it("关闭不存在的 tab：状态不变", () => {
    const s = openFile(initialState(), "a.ts", "a.ts");
    const next = closeTab(s, "nope.ts");
    expect(next).toEqual(s);
  });
});

describe("dirty 状态", () => {
  it("新开文件 tab 不脏；编辑上报后脏", () => {
    const s = openFile(initialState(), "a.ts", "a.ts");
    expect(tabDirty(s, "a.ts")).toBe(false);
    expect(setDirty(s, "a.ts", true).tabs).toContainEqual({ kind: "file", path: "a.ts", name: "a.ts", dirty: true, preview: false });
  });

  it("保存后清除 dirty；重复上报不产生新引用", () => {
    let s = openFile(initialState(), "a.ts", "a.ts");
    s = setDirty(s, "a.ts", true);
    const before = s;
    s = setDirty(s, "a.ts", true);
    expect(s).toBe(before); // 幂等
    s = setDirty(s, "a.ts", false);
    expect(tabDirty(s, "a.ts")).toBe(false);
  });

  it("hasDirty 汇总", () => {
    let s = openFile(initialState(), "a.ts", "a.ts");
    s = openFile(s, "b.ts", "b.ts");
    expect(hasDirty(s)).toBe(false);
    s = setDirty(s, "b.ts", true);
    expect(hasDirty(s)).toBe(true);
  });

  it("不存在路径的 dirty 上报被忽略", () => {
    const s = openFile(initialState(), "a.ts", "a.ts");
    expect(setDirty(s, "nope.ts", true)).toBe(s);
  });
});

describe("preview 模型", () => {
  it("预览打开：标记 preview；再预览其他文件 → 关闭旧预览（全局唯一）", () => {
    const s1 = openFile(initialState(), "a.ts", "a.ts", { preview: true });
    const a = s1.tabs.find((t) => t.kind === "file" && t.path === "a.ts");
    expect(a && a.kind === "file" && a.preview).toBe(true);
    const s2 = openFile(s1, "b.ts", "b.ts", { preview: true });
    expect(s2.tabs.filter((t) => t.kind === "file")).toHaveLength(1); // a 被替换，仅 b
    expect(s2.tabs.some((t) => t.kind === "file" && t.path === "a.ts")).toBe(false);
    expect(s2.active).toBe("b.ts");
  });

  it("promotePreview：预览 → 正式（正体）", () => {
    const s1 = openFile(initialState(), "a.ts", "a.ts", { preview: true });
    const s2 = promotePreview(s1, "a.ts");
    const a = s2.tabs.find((t) => t.kind === "file" && t.path === "a.ts");
    expect(a && a.kind === "file" && a.preview).toBe(false);
  });

  it("打开已存在的 preview 文件（单击幂等）：不替换自身", () => {
    const s1 = openFile(initialState(), "a.ts", "a.ts", { preview: true });
    const s2 = openFile(s1, "a.ts", "a.ts", { preview: true });
    expect(s2.tabs.filter((t) => t.kind === "file")).toHaveLength(1);
    expect(s2.active).toBe("a.ts");
  });

  it("双击（preview:false）已有 preview 文件 → 转正（promote）", () => {
    const s1 = openFile(initialState(), "a.ts", "a.ts", { preview: true });
    const s2 = openFile(s1, "a.ts", "a.ts", { preview: false });
    const a = s2.tabs.find((t) => t.kind === "file" && t.path === "a.ts");
    expect(a && a.kind === "file" && a.preview).toBe(false);
  });

  it("preview 文件被替换时其 dirty 状态一并移除（tab 关闭）", () => {
    let s = openFile(initialState(), "a.ts", "a.ts", { preview: true });
    s = setDirty(s, "a.ts", true);
    const s2 = openFile(s, "b.ts", "b.ts", { preview: true });
    expect(s2.tabs.some((t) => t.kind === "file" && t.path === "a.ts")).toBe(false);
    expect(s2.tabs.some((t) => t.kind === "file" && t.path === "b.ts" && t.dirty === false)).toBe(true);
  });

  it("默认打开（无 preview 参数）= permanent（兼容既有行为）", () => {
    const s = openFile(initialState(), "a.ts", "a.ts");
    const a = s.tabs.find((t) => t.kind === "file" && t.path === "a.ts");
    expect(a && a.kind === "file" && a.preview).toBe(false);
  });
});

describe("diff tab", () => {
  it("openDiffTab 追加并激活（active 带 diff: 前缀）；与文件 tab 共存", () => {
    let s = openFile(initialState(), "a.ts", "a.ts");
    s = openDiffTab(s, "a.ts", "a.ts");
    expect(s.tabs.some((t) => t.kind === "diff" && t.path === "a.ts")).toBe(true);
    expect(s.tabs.filter((t) => t.kind === "file")).toHaveLength(1);
    expect(s.active).toBe("diff:a.ts");
    expect(diffPathOf(s.active)).toBe("a.ts");
  });

  it("openDiffTab 去重（再次打开仅激活）", () => {
    const s1 = openDiffTab(initialState(), "a.ts", "a.ts");
    const s2 = openDiffTab(s1, "a.ts", "a.ts");
    expect(s2.tabs.filter((t) => t.kind === "diff")).toHaveLength(1);
  });

  it("closeTab 关闭 diff tab", () => {
    const s1 = openDiffTab(initialState(), "a.ts", "a.ts");
    const s2 = closeTab(s1, "diff:a.ts");
    expect(s2.tabs.some((t) => t.kind === "diff")).toBe(false);
    expect(s2.active).toBe("chat");
  });
});
