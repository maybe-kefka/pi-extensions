// @vitest-environment jsdom
// EditorPane 测试（jsdom）：防抖自动保存 + 冲突三选
// CodeMirror mock 为 textarea（onChange 桥接）；保存/重载逻辑经真实 RPC mock 验证
vi.mock("@uiw/react-codemirror", () => ({
  default: ({ value, onChange, readOnly }: { value: string; onChange?: (v: string) => void; readOnly?: boolean }) => (
    <textarea
      data-testid="cm"
      value={value}
      readOnly={readOnly}
      onChange={(e) => onChange?.(e.target.value)}
    />
  ),
}));
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { EditorPane, type EditorPaneHandle } from "./EditorPane";
import type { OpenedFile } from "@/entities/files/editor";
import type { RpcClient } from "@/shared/api/rpc";

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

