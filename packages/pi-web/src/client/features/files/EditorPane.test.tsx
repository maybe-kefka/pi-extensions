// @vitest-environment jsdom
// EditorPane 测试（jsdom）：防抖自动保存 + 冲突三选
// CodeMirror mock 为 textarea（onChange 桥接）；onCreateEditor/onUpdate 暴露到元素上供测试触发
vi.mock("@uiw/react-codemirror", () => ({
  default: ({
    value,
    onChange,
    readOnly,
    onCreateEditor,
    onUpdate,
  }: {
    value: string;
    onChange?: (v: string) => void;
    readOnly?: boolean;
    onCreateEditor?: (view: unknown) => void;
    onUpdate?: (update: unknown) => void;
  }) =>
    (
      <textarea
        data-testid="cm"
        value={value}
        readOnly={readOnly}
        onChange={(e) => onChange?.(e.target.value)}
        ref={(el) => {
          if (el) {
            (el as unknown as Record<string, unknown>).__onCreateEditor = onCreateEditor;
            (el as unknown as Record<string, unknown>).__onUpdate = onUpdate;
          }
        }}
      />
    ),
}));
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { EditorPane, type EditorPaneHandle } from "./EditorPane";
import { initialEditState } from "@/entities/files";
import type { OpenedFile } from "@/entities/files";
import type { RpcClient } from "@/shared/api";

const FILE: OpenedFile = {
  path: "a.ts",
  name: "a.ts",
  content: "old",
  mode: "text",
  size: 3,
  mtimeMs: 100,
  hash: "h1",
};

function makeRequest(overrides: Partial<Record<"writeFile" | "readFile" | "gitDiff", (params: Record<string, unknown>) => unknown>> = {}) {
  const calls: string[] = [];
  const request = (async (method: string, params: Record<string, unknown> = {}) => {
    calls.push(`${method}:${JSON.stringify(params)}`);
    if (method === "pi:writeFile") {
      if (overrides.writeFile) return overrides.writeFile(params);
      return { ok: true };
    }
    if (method === "pi:readFile") {
      if (overrides.readFile) return overrides.readFile(params);
      return { content: "old", mode: "text", size: 3, mtimeMs: 100, hash: "h1" };
    }
    if (method === "pi:gitDiff") {
      if (overrides.gitDiff) return overrides.gitDiff(params);
      return { isRepo: false, diff: null };
    }
    throw new Error(`unexpected ${method}`);
  }) as RpcClient["request"];
  return { request, calls };
}

describe("EditorPane 防抖保存", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("编辑不自动落盘；显式 save() 落盘（expected 快照来自打开时）", async () => {
    const { request, calls } = makeRequest();
    const ref = createRef<EditorPaneHandle>();
    render(<EditorPane path="a.ts" request={request} ref={ref} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const cm = screen.getByTestId("cm") as HTMLTextAreaElement;
    fireEvent.change(cm, { target: { value: "old!" } });
    expect(screen.getByText("●")).toBeTruthy(); // 脏标记
    // 等待任意长也不落盘（无自动保存）
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(calls.some((c) => c.startsWith("pi:writeFile"))).toBe(false);
    // 显式保存
    await act(async () => {
      await ref.current?.save();
    });
    const w = calls.find((c) => c.startsWith("pi:writeFile"));
    expect(w).toContain('"expectedHash":"h1"');
    expect(w).toContain('"expectedMtimeMs":100');
    expect(w).toContain('"content":"old!"');
  });

  it("编辑上报 onDirtyChange(true)，保存后上报 false", async () => {
    const { request } = makeRequest();
    const onDirty = vi.fn();
    const ref = createRef<EditorPaneHandle>();
    render(<EditorPane path="a.ts" request={request} ref={ref} onDirtyChange={onDirty} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const cm = screen.getByTestId("cm") as HTMLTextAreaElement;
    fireEvent.change(cm, { target: { value: "old!" } });
    expect(onDirty).toHaveBeenLastCalledWith("a.ts", true);
    await act(async () => {
      await ref.current?.save();
    });
    expect(onDirty).toHaveBeenLastCalledWith("a.ts", false);
  });

  it("只读文件（binary/too-large）不出现保存路径", async () => {
    const { request } = makeRequest();
    render(<EditorPane path="a.ts" request={makeRequest({ readFile: () => ({ content: "", mode: "binary", size: 3, mtimeMs: 100, hash: "h1" }) }).request} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText(/二进制内容不可预览/)).toBeTruthy();
    expect(screen.queryByTestId("cm")).toBeNull();
  });

  it("冲突 → 弹窗三选；覆盖 → 用磁盘当前快照重写", async () => {
    let writeCount = 0;
    const { request, calls } = makeRequest({
      writeFile: (params) => {
        writeCount += 1;
        if (writeCount === 1) return { ok: false, reason: "conflict", current: { hash: "hX", mtimeMs: 999 } };
        return { ok: true };
      },
    });
    const ref = createRef<EditorPaneHandle>();
    render(<EditorPane path="a.ts" request={request} ref={ref} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const cm = screen.getByTestId("cm") as HTMLTextAreaElement;
    fireEvent.change(cm, { target: { value: "old!" } });
    await act(async () => {
      await ref.current?.save();
    });
    expect(screen.getByText("文件已被外部修改")).toBeTruthy();
    fireEvent.click(screen.getByText("覆盖保存"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const w = calls.filter((c) => c.startsWith("pi:writeFile"));
    expect(w.length).toBe(2);
    expect(w[1]).toContain('"expectedHash":"hX"');
    expect(w[1]).toContain('"expectedMtimeMs":999');
  });

  it("冲突 → 放弃 → 重载磁盘内容（编辑丢弃）", async () => {
    let writeCount = 0;
    const { request, calls } = makeRequest({
      writeFile: () => {
        writeCount += 1;
        return { ok: false, reason: "conflict", current: { hash: "hX", mtimeMs: 999 } };
      },
      readFile: () => ({ content: "external", mode: "text", size: 8, mtimeMs: 500, hash: "hE" }),
    });
    const ref = createRef<EditorPaneHandle>();
    render(<EditorPane path="a.ts" request={request} ref={ref} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const cm = screen.getByTestId("cm") as HTMLTextAreaElement;
    fireEvent.change(cm, { target: { value: "old!" } });
    await act(async () => {
      await ref.current?.save();
    });
    fireEvent.click(screen.getByText("放弃编辑"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect((screen.getByTestId("cm") as HTMLTextAreaElement).value).toBe("external");
    expect(screen.queryByText("●")).toBeNull();
    expect(calls.some((c) => c.startsWith("pi:readFile"))).toBe(true);
  });
});


describe("EditorPane 工具栏（06：文件视图 header）", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  it("dirty 时显示保存按钮（点击触发保存 RPC）；干净时不显示", async () => {
    const { request, calls } = makeRequest();
    const ref = createRef<EditorPaneHandle>();
    render(<EditorPane path="a.ts" request={request} ref={ref} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    // 初始干净：无保存按钮
    expect(screen.queryByText("保存")).toBeNull();
    // 编辑 → dirty → 保存按钮出现 → 点击触发写盘
    const cm = screen.getByTestId("cm") as HTMLTextAreaElement;
    fireEvent.change(cm, { target: { value: "old!" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const saveBtn = screen.getByText("保存");
    fireEvent.click(saveBtn);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(calls.some((c) => c.startsWith("pi:writeFile"))).toBe(true);
  });

  it("工具栏有撤销/重做/重新加载按钮（vscode 风格）", async () => {
    const { request } = makeRequest();
    const ref = createRef<EditorPaneHandle>();
    render(<EditorPane path="a.ts" request={request} ref={ref} />);
    expect(screen.getByTitle("撤销")).toBeTruthy();
    expect(screen.getByTitle("重做")).toBeTruthy();
    expect(screen.getByTitle(/重新加载/)).toBeTruthy();
  });
});

describe("EditorPane 状态快照（R28 tab-state-preserve）", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  function snapshotEdit(over: Partial<ReturnType<typeof initialEditState>> = {}): ReturnType<typeof initialEditState> {
    return { ...initialEditState(FILE), content: "unsaved", dirty: true, ...over };
  }

  interface MockView {
    state: { selection: { main: { anchor: number; head: number } } };
    scrollDOM: { scrollTop: number };
    dispatch: ReturnType<typeof vi.fn>;
  }
  function mockView(sel = { anchor: 3, head: 3 }, scrollTop = 42): MockView {
    return {
      state: { selection: { main: sel } },
      scrollDOM: { scrollTop },
      dispatch: vi.fn(),
    };
  }

  it("onUpdate 持续上报：快照含最新 content/selection/scrollTop", async () => {
    const onStateSave = vi.fn();
    render(<EditorPane path="a.ts" request={makeRequest().request} onStateSave={onStateSave} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const cm = screen.getAllByTestId("cm").at(-1) as unknown as HTMLElement & Record<string, unknown>;
    fireEvent.change(cm, { target: { value: "edited" } }); // edit.content → "edited"
    const view = mockView({ anchor: 5, head: 7 }, 120);
    (cm.__onUpdate as (u: unknown) => void)({ state: view.state, view });
    const snap = onStateSave.mock.calls.at(-1)?.[1] as { edit: { content: string }; selection: { anchor: number; head: number }; scrollTop: number };
    expect(snap.edit.content).toBe("edited");
    expect(snap.selection).toEqual({ anchor: 5, head: 7 });
    expect(snap.scrollTop).toBe(120);
  });

  it("savedState 恢复：初始内容/脏标记来自快照，首次加载不覆盖", async () => {
    // readFile 返回磁盘 "old"——恢复内容 "unsaved" 应保持
    const { request } = makeRequest({ readFile: () => ({ content: "old", mode: "text", size: 3, mtimeMs: 100, hash: "h1" }) });
    render(<EditorPane path="a.ts" request={request} savedState={{ edit: snapshotEdit(), selection: null, scrollTop: null }} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const cm = screen.getByTestId("cm") as HTMLTextAreaElement;
    expect(cm.value).toBe("unsaved");
    // dirty 圆点显示（恢复的未保存标记）
    expect(document.body.textContent).toContain("保存");
  });

  it("onCreateEditor 恢复光标与滚动", async () => {
    render(
      <EditorPane
        path="a.ts"
        request={makeRequest().request}
        savedState={{ edit: snapshotEdit(), selection: { anchor: 2, head: 5 }, scrollTop: 30 }}
      />,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const cm = screen.getByTestId("cm") as unknown as Record<string, unknown>;
    const view = mockView();
    (cm.__onCreateEditor as (v: MockView) => void)(view);
    expect(view.dispatch).toHaveBeenCalled();
    expect(view.scrollDOM.scrollTop).toBe(30);
  });

  it("恢复后保存：冲突检测用恢复的 savedHash", async () => {
    const { request, calls } = makeRequest();
    render(
      <EditorPane
        path="a.ts"
        request={request}
        savedState={{ edit: snapshotEdit({ savedHash: "h-snap" }), selection: null, scrollTop: null }}
      />,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    fireEvent.change(screen.getByTestId("cm"), { target: { value: "unsaved2" } });
    fireEvent.click(screen.getByText("保存"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const write = calls.find((c) => c.startsWith("pi:writeFile"));
    expect(write).toBeDefined();
    expect(write).toContain('"expectedHash":"h-snap"');
  });

  it("卸载兜底上报", async () => {
    const onStateSave = vi.fn();
    const { unmount } = render(<EditorPane path="a.ts" request={makeRequest().request} onStateSave={onStateSave} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    fireEvent.change(screen.getByTestId("cm"), { target: { value: "x" } });
    unmount();
    const last = onStateSave.mock.calls.at(-1)?.[1] as { edit: { content: string } };
    expect(last.edit.content).toBe("x");
  });
});
