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
import { EditorPane } from "./EditorPane";
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
      return { content: "new", mode: "text", size: 3, mtimeMs: 200, hash: "h2" };
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

  it("编辑后 800ms 自动保存（expected 快照来自打开时）", async () => {
    const { request, calls } = makeRequest();
    const onReload = vi.fn();
    render(<EditorPane file={FILE} request={request} onReload={onReload} />);
    const cm = screen.getByTestId("cm") as HTMLTextAreaElement;
    fireEvent.change(cm, { target: { value: "old!" } });
    expect(screen.getByText("●")).toBeTruthy(); // 脏标记
    await act(async () => {
      await vi.advanceTimersByTimeAsync(900);
    });
    const w = calls.find((c) => c.startsWith("pi:writeFile"));
    expect(w).toContain('"expectedHash":"h1"');
    expect(w).toContain('"expectedMtimeMs":100');
    expect(w).toContain('"content":"old!"');
    expect(onReload).toHaveBeenCalled();
  });

  it("连续输入只保存一次（防抖重置）", async () => {
    const { request, calls } = makeRequest();
    render(<EditorPane file={FILE} request={request} onReload={vi.fn()} />);
    const cm = screen.getByTestId("cm") as HTMLTextAreaElement;
    fireEvent.change(cm, { target: { value: "olda" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    fireEvent.change(cm, { target: { value: "oldb" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(900);
    });
    expect(calls.filter((c) => c.startsWith("pi:writeFile")).length).toBe(1);
  });

  it("只读文件（binary/too-large）不出现保存路径", () => {
    const { request } = makeRequest();
    render(<EditorPane file={{ ...FILE, mode: "binary", content: "" }} request={request} onReload={vi.fn()} />);
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
    render(<EditorPane file={FILE} request={request} onReload={vi.fn()} />);
    const cm = screen.getByTestId("cm") as HTMLTextAreaElement;
    fireEvent.change(cm, { target: { value: "old!" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(900);
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
    const { request } = makeRequest({
      writeFile: () => {
        writeCount += 1;
        return { ok: false, reason: "conflict", current: { hash: "hX", mtimeMs: 999 } };
      },
      readFile: () => ({ content: "external", mode: "text", size: 8, mtimeMs: 500, hash: "hE" }),
    });
    const onReload = vi.fn();
    render(<EditorPane file={FILE} request={request} onReload={onReload} />);
    const cm = screen.getByTestId("cm") as HTMLTextAreaElement;
    fireEvent.change(cm, { target: { value: "old!" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(900);
    });
    fireEvent.click(screen.getByText("放弃编辑"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect((screen.getByTestId("cm") as HTMLTextAreaElement).value).toBe("external");
    expect(screen.queryByText("●")).toBeNull();
    expect(onReload).toHaveBeenCalledWith(expect.objectContaining({ hash: "hE" }));
  });
});

describe("EditorPane diff 视图", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("打开文件加载 gitDiff 并渲染行级标记", async () => {
    const { request, calls } = makeRequest({
      gitDiff: () => ({
        isRepo: true,
        diff: [
          {
            header: "@@ -1 +1 @@",
            lines: [
              { type: "del", text: "old" },
              { type: "add", text: "new" },
            ],
          },
        ],
      }),
    });
    render(<EditorPane file={FILE} request={request} onReload={vi.fn()} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(calls.some((c) => c.startsWith("pi:gitDiff"))).toBe(true);
    expect(screen.getByText("diff vs HEAD")).toBeTruthy();
    expect(screen.getAllByText("old").length).toBeGreaterThan(0);
    expect(screen.getByText("new")).toBeTruthy();
    expect(screen.getByText("+1")).toBeTruthy();
  });

  it("非 git 仓库显示占位", async () => {
    const { request } = makeRequest({ gitDiff: () => ({ isRepo: false, diff: null }) });
    render(<EditorPane file={FILE} request={request} onReload={vi.fn()} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText("非 git 仓库，无 diff")).toBeTruthy();
  });

  it("保存成功后重新加载 diff", async () => {
    let diffCalls = 0;
    const { request, calls } = makeRequest({
      gitDiff: () => ({ isRepo: true, diff: diffCalls++ === 0 ? [{ header: "@@ -1 +1 @@", lines: [{ type: "del", text: "old" }] }] : null }),
    });
    render(<EditorPane file={FILE} request={request} onReload={vi.fn()} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const cm = screen.getByTestId("cm") as HTMLTextAreaElement;
    fireEvent.change(cm, { target: { value: "old!" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(900);
    });
    expect(calls.filter((c) => c.startsWith("pi:gitDiff")).length).toBe(2);
    expect(screen.getByText("无改动（与 HEAD 一致）")).toBeTruthy();
  });
});
