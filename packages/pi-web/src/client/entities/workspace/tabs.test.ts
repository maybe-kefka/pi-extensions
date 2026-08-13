import { describe, expect, it } from "vitest";
import {
  activateTab,
  chatLeaveAction,
  chatOpenAction,
  diffAgentTabs,
  markChatDead,
  moveTab,
  type WorkspaceTab,
  chatTabId,
  chatSessionOf,
  openChatTab,
  closeChatTab,
  closeTab,
  diffPathOf,
  hasDirty,
  initialState,
  openDiffTab,
  openFile,
  promotePreview,
  resolveInsertIndex,
  reviveChatTab,
  setDirty,
  tabDirty,
  type WorkspaceState,
} from "./tabs.js";

describe("workspace tab 状态机", () => {
  it("初始态：无 tab（主区空态——由会话/文件面板打开）", () => {
    const s = initialState();
    expect(s.tabs).toEqual([]);
    expect(s.active).toBe("");
  });

  it("打开新文件：追加 tab 并激活", () => {
    const s = openFile(initialState(), "a.ts", "a.ts");
    expect(s.tabs.map((t) => (t.kind === "file" ? t.path : "chat"))).toEqual(["a.ts"]);
    expect(s.active).toBe("a.ts");
  });

  it("打开已打开文件：不重复追加，仅激活", () => {
    let s = openFile(initialState(), "a.ts", "a.ts");
    s = openFile(s, "b.ts", "b.ts");
    s = openFile(s, "a.ts", "a.ts");
    expect(s.tabs.filter((t) => t.kind === "file")).toHaveLength(2);
    expect(s.active).toBe("a.ts");
  });

  it("打开会话 chat tab：追加并激活；同会话去重", () => {
    let s = openChatTab(initialState(), "/s/a.jsonl", "会话A");
    expect(s.active).toBe("chat:/s/a.jsonl");
    s = openChatTab(s, "/s/b.jsonl", "会话B");
    expect(s.tabs.filter((t) => t.kind === "chat")).toHaveLength(2);
    s = openChatTab(s, "/s/a.jsonl", "会话A");
    expect(s.tabs.filter((t) => t.kind === "chat")).toHaveLength(2);
    expect(s.active).toBe("chat:/s/a.jsonl");
  });

  it("切换 tab：chat 与文件互切", () => {
    let s = openChatTab(initialState(), "/s/a.jsonl", "会话A");
    s = openFile(s, "a.ts", "a.ts");
    s = activateTab(s, "chat:/s/a.jsonl");
    expect(s.active).toBe("chat:/s/a.jsonl");
    s = activateTab(s, "a.ts");
    expect(s.active).toBe("a.ts");
  });

  it("关闭激活文件 tab：激活右侧相邻（无则左侧）", () => {
    let s = openFile(initialState(), "a.ts", "a.ts");
    s = openFile(s, "b.ts", "b.ts");
    s = closeTab(s, "b.ts");
    expect(s.active).toBe("a.ts");
    // 关闭 a（激活）→ 无相邻 → 空态
    s = closeTab(s, "a.ts");
    expect(s.active).toBe("");
  });

  it("关闭非激活 tab：激活不变", () => {
    let s = openFile(initialState(), "a.ts", "a.ts");
    s = openFile(s, "b.ts", "b.ts");
    s = activateTab(s, "a.ts");
    s = closeTab(s, "b.ts");
    expect(s.active).toBe("a.ts");
  });

  it("chat tab 全可关（与 file 同级）——关闭激活 chat 激活相邻/空态", () => {
    let s = openChatTab(initialState(), "/s/a.jsonl", "会话A");
    s = openChatTab(s, "/s/b.jsonl", "会话B");
    s = closeChatTab(s, "/s/a.jsonl");
    expect(s.active).toBe("chat:/s/b.jsonl"); // 右邻
    s = closeChatTab(s, "/s/b.jsonl");
    expect(s.tabs).toEqual([]);
    expect(s.active).toBe("");
  });

  it("chatTabId/chatSessionOf 解析", () => {
    expect(chatTabId("/s/a.jsonl")).toBe("chat:/s/a.jsonl");
    expect(chatSessionOf("chat:/s/a.jsonl")).toBe("/s/a.jsonl");
    expect(chatSessionOf("a.ts")).toBeNull();
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
    expect(s2.active).toBe("");
  });
});



describe("diffAgentTabs（注册者列表 → tab 增删）", () => {
  it("新 agent 会话 → join（开 tab）", () => {
    const d = diffAgentTabs(
      { tabs: [], active: "" },
      [{ sessionFile: "/s/1.jsonl", sessionName: "会话A" }],
    );
    expect(d.join).toEqual([{ sessionFile: "/s/1.jsonl", sessionName: "会话A" }]);
    expect(d.leave).toEqual([]);
  });

  it("已开的会话不重复 join；无 sessionFile 的 agent 忽略", () => {
    const tabs: WorkspaceTab[] = [{ kind: "chat", sessionId: "/s/1.jsonl", name: "会话A" }];
    const d = diffAgentTabs({ tabs, active: "" }, [
      { sessionFile: "/s/1.jsonl", sessionName: "会话A" },
      { sessionFile: null, sessionName: null },
    ]);
    expect(d.join).toEqual([]);
  });

  it("agent 消失（退出/换会话）→ leave（关对应 tab）；tab 被手动关的会话不在 leave", () => {
    const tabs: WorkspaceTab[] = [
      { kind: "chat", sessionId: "/s/1.jsonl", name: "会话A" },
      { kind: "chat", sessionId: "/s/2.jsonl", name: "会话B" },
      { kind: "file", path: "/r/a.ts", name: "a.ts", dirty: false, preview: false },
    ];
    const d = diffAgentTabs({ tabs, active: "" }, [
      { sessionFile: "/s/1.jsonl", sessionName: "会话A" },
    ]);
    expect(d.leave).toEqual(["/s/2.jsonl"]);
  });

  it("agent 会话切换（sessionFile 变）→ 旧 leave + 新 join", () => {
    const tabs: WorkspaceTab[] = [{ kind: "chat", sessionId: "/s/1.jsonl", name: "会话A" }];
    const d = diffAgentTabs({ tabs, active: "" }, [
      { sessionFile: "/s/2.jsonl", sessionName: "会话B" },
    ]);
    expect(d.leave).toEqual(["/s/1.jsonl"]);
    expect(d.join).toEqual([{ sessionFile: "/s/2.jsonl", sessionName: "会话B" }]);
  });
});

describe("chatOpenAction（会话管理点击决策）", () => {
  const agents = [{ sessionFile: "/s/1.jsonl" }];
  it("已有 tab → activate（不重复开）", () => {
    const s: WorkspaceState = { tabs: [{ kind: "chat", sessionId: "/s/1.jsonl", name: "A" }], active: "" };
    expect(chatOpenAction(s, agents, "/s/1.jsonl")).toEqual({ kind: "activate" });
  });
  it("有实例无 tab → open", () => {
    const s: WorkspaceState = { tabs: [], active: "" };
    expect(chatOpenAction(s, agents, "/s/1.jsonl")).toEqual({ kind: "open", name: "1.jsonl" });
  });
  it("无实例 → spawn", () => {
    const s: WorkspaceState = { tabs: [], active: "" };
    expect(chatOpenAction(s, agents, "/s/2.jsonl")).toEqual({ kind: "spawn" });
  });
});

describe("断线标记（agent 退出 → tab dead；重开复活）", () => {
  it("markChatDead：标记断线不关 tab；不存在忽略", () => {
    const s: WorkspaceState = { tabs: [{ kind: "chat", sessionId: "/s/1.jsonl", name: "A" }], active: "" };
    const d = markChatDead(s, "/s/1.jsonl");
    expect(d.tabs[0]).toMatchObject({ kind: "chat", sessionId: "/s/1.jsonl", dead: true });
    expect(markChatDead(s, "/s/nope.jsonl")).toBe(s);
  });

  it("chatLeaveAction：dead 的 tab 保持（断线）；非 dead 关闭（TUI 切换）", () => {
    const tabs: WorkspaceTab[] = [
      { kind: "chat", sessionId: "/s/1.jsonl", name: "A", dead: true },
      { kind: "chat", sessionId: "/s/2.jsonl", name: "B" },
    ];
    expect(chatLeaveAction(tabs, "/s/1.jsonl")).toBe("keep");
    expect(chatLeaveAction(tabs, "/s/2.jsonl")).toBe("close");
  });

  it("reviveChatTab：清 dead 标记（位置/顺序不变）；非 dead / 不存在 → 状态不变", () => {
    const s: WorkspaceState = {
      tabs: [
        { kind: "chat", sessionId: "/s/1.jsonl", name: "A", dead: true },
        { kind: "file", path: "/a.ts", name: "a.ts", dirty: false, preview: false },
      ],
      active: "",
    };
    const r = reviveChatTab(s, "/s/1.jsonl");
    expect(r.tabs[0]).toMatchObject({ kind: "chat", sessionId: "/s/1.jsonl", dead: false });
    expect(r.tabs[1]).toBe(s.tabs[1]); // 其他 tab 引用不变
    expect(reviveChatTab(s, "/s/2.jsonl")).toBe(s); // 不存在
    const alive: WorkspaceState = { tabs: [{ kind: "chat", sessionId: "/s/1.jsonl", name: "A" }], active: "" };
    expect(reviveChatTab(alive, "/s/1.jsonl")).toBe(alive); // 非 dead → 引用相等
  });
});

  it("dead tab 的打开 → spawn（重新拉起）而非 activate", () => {
    const s: WorkspaceState = { tabs: [{ kind: "chat", sessionId: "/s/1.jsonl", name: "A", dead: true }], active: "" };
    expect(chatOpenAction(s, [], "/s/1.jsonl")).toEqual({ kind: "spawn" });
  });

  it("dead tab 的会话重新注册 → join（重建复活）", () => {
    const tabs: WorkspaceTab[] = [{ kind: "chat", sessionId: "/s/1.jsonl", name: "A", dead: true }];
    const d = diffAgentTabs({ tabs, active: "" }, [{ sessionFile: "/s/1.jsonl", sessionName: "A" }]);
    expect(d.join).toEqual([{ sessionFile: "/s/1.jsonl", sessionName: "A" }]);
    expect(d.leave).toEqual([]);
  });

describe("moveTab（拖拽调序）", () => {
  const tabs: WorkspaceTab[] = [
    { kind: "file", path: "/a.ts", name: "a.ts", dirty: false, preview: false },
    { kind: "chat", sessionId: "/s/1.jsonl", name: "A" },
    { kind: "file", path: "/b.ts", name: "b.ts", dirty: false, preview: false },
  ];
  it("前移（chat 拖到最前）", () => {
    const s: WorkspaceState = { tabs, active: "/a.ts" };
    const m = moveTab(s, chatTabId("/s/1.jsonl"), "/a.ts");
    expect(m.tabs.map((t) => (t.kind === "file" ? t.path : t.kind === "chat" ? t.sessionId : ""))).toEqual(["/s/1.jsonl", "/a.ts", "/b.ts"]);
    expect(m.active).toBe("/a.ts"); // 激活不变
  });
  it("后移（a.ts 拖到最后）", () => {
    const s: WorkspaceState = { tabs, active: "" };
    const m = moveTab(s, "/a.ts", "/b.ts");
    expect(m.tabs.map((t) => (t.kind === "file" ? t.path : t.kind === "chat" ? t.sessionId : ""))).toEqual(["/s/1.jsonl", "/b.ts", "/a.ts"]);
  });
  it("非法 id（不存在）→ 状态不变", () => {
    const s: WorkspaceState = { tabs, active: "" };
    expect(moveTab(s, "/nope.ts", "/a.ts")).toBe(s);
    expect(moveTab(s, "/a.ts", "/nope.ts")).toBe(s);
  });
});

describe("resolveInsertIndex（tab 栏按 x 插入位置）", () => {
  const bounds = [
    { left: 0, width: 100 }, // tab0
    { left: 100, width: 100 }, // tab1
    { left: 200, width: 100 }, // tab2
  ];
  it("空列表 → 0（追加末尾即开头）", () => {
    expect(resolveInsertIndex([], 50)).toBe(0);
  });
  it("x 在 tab 左半 → 该 tab 前", () => {
    expect(resolveInsertIndex(bounds, 10)).toBe(0);
    expect(resolveInsertIndex(bounds, 140)).toBe(1);
  });
  it("x 在 tab 右半 → 下一个 tab 前（= 该 tab 后）", () => {
    expect(resolveInsertIndex(bounds, 60)).toBe(1);
    expect(resolveInsertIndex(bounds, 260)).toBe(3);
  });
  it("x 恰好在中点 → 左半（前插）", () => {
    expect(resolveInsertIndex(bounds, 50)).toBe(0);
    expect(resolveInsertIndex(bounds, 150)).toBe(1);
  });
  it("x 在末尾之后 → 末尾", () => {
    expect(resolveInsertIndex(bounds, 999)).toBe(3);
    expect(resolveInsertIndex(bounds, 300)).toBe(3);
  });
});
