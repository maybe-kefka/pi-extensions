// @vitest-environment jsdom
// FilesTree 渲染测试（jsdom）：目录树浏览 + 打开文件回调 + 错误提示
// CodeMirror 在 jsdom 缺 getClientRects —— mock 为纯文本容器（编辑器内部不测）
vi.mock("@uiw/react-codemirror", () => ({
  default: ({ value }: { value: string }) => <div data-testid="cm">{value}</div>,
}));
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FilesTree } from "./FilesTree";
import type { RpcClient } from "@/shared/api/rpc";

/** 假 RPC：listDir 返回内存树，readFile 返回内存内容 */
function fakeRequest(files: Record<string, string>): RpcClient["request"] {
  const dirs = new Map<string, string[]>();
  for (const p of Object.keys(files)) {
    const parts = p.split("/");
    for (let i = 0; i < parts.length; i++) {
      const dir = parts.slice(0, i).join("/");
      const name = parts[i];
      if (!dirs.has(dir)) dirs.set(dir, []);
      const list = dirs.get(dir)!;
      if (!list.includes(name)) list.push(name);
    }
  }
  return (async (method: string, params: Record<string, unknown> = {}): Promise<unknown> => {
    if (method === "pi:listDir") {
      const path = (params.path as string) ?? "";
      const names = dirs.get(path) ?? [];
      return {
        entries: names.map((name) => {
          const isDir = dirs.has(path === "" ? name : `${path}/${name}`);
          return { name, type: isDir ? "dir" : "file", size: 0, mtimeMs: 1 };
        }),
      };
    }
    if (method === "pi:readFile") {
      const content = files[params.path as string] ?? "";
      return { content, mode: "text", size: content.length, mtimeMs: 1, hash: "h" };
    }
    throw new Error(`unexpected method ${method}`);
  }) as RpcClient["request"];
}

afterEach(cleanup);

describe("FilesTree", () => {
  it("首屏加载根目录并显示条目", async () => {
    render(<FilesTree request={fakeRequest({ "README.md": "hi", "src/main.ts": "x" })} onOpenFile={vi.fn()} activePath={null} />);
    expect(await screen.findByText("README.md")).toBeTruthy();
    expect(screen.getByText("src")).toBeTruthy();
  });

  it("展开目录后显示子文件", async () => {
    const user = userEvent.setup();
    render(<FilesTree request={fakeRequest({ "src/main.ts": "x" })} onOpenFile={vi.fn()} activePath={null} />);
    await user.click(await screen.findByText("src"));
    expect(await screen.findByText("main.ts")).toBeTruthy();
  });

  it("单击文件回调 onOpenFile（preview）；双击正式打开", async () => {
    const user = userEvent.setup();
    const onOpenFile = vi.fn();
    render(<FilesTree request={fakeRequest({ "a.txt": "hello world" })} onOpenFile={onOpenFile} activePath={null} />);
    const row = await screen.findByText("a.txt");
    await user.click(row);
    expect(onOpenFile).toHaveBeenLastCalledWith("a.txt", "a.txt", true); // 单击 preview
    await user.dblClick(row);
    expect(onOpenFile).toHaveBeenLastCalledWith("a.txt", "a.txt", false); // 双击 permanent
  });

  it("listDir 失败显示错误提示", async () => {
    const user = userEvent.setup();
    const request = (async (method: string) => {
      if (method === "pi:gitInfo") return { isRepo: false };
      throw new Error("目录不存在或越权");
    }) as RpcClient["request"];
    render(<FilesTree request={request} onOpenFile={vi.fn()} activePath={null} />);
    expect(await screen.findByText(/目录不存在或越权/)).toBeTruthy();
  });
});

describe("FilesTree 文件操作", () => {
  afterEach(cleanup);

  function opRequest(calls: string[]): RpcClient["request"] {
    return (async (method: string, params: Record<string, unknown> = {}) => {
      calls.push(`${method}:${JSON.stringify(params)}`);
      if (method === "pi:listDir") {
        const path = (params.path as string) ?? "";
        const name = path === "" ? "a.txt" : path.split("/").pop()!;
        return { entries: [{ name, type: "file", size: 1, mtimeMs: 1 }] };
      }
      if (method === "pi:gitInfo") return { isRepo: false };
      if (method === "pi:gitStatus") return { isRepo: false, aggregated: {} };
      if (method === "pi:delete") return { removedCount: 2 };
      if (method === "pi:touch" || method === "pi:mkdir" || method === "pi:rename") return { ok: true };
      throw new Error(`unexpected ${method}`);
    }) as RpcClient["request"];
  }

  it("新建文件：弹窗输入 → pi:touch 调用 → onOpenFile", async () => {
    const user = userEvent.setup();
    const calls: string[] = [];
    const onOpenFile = vi.fn();
    render(<FilesTree request={opRequest(calls)} onOpenFile={onOpenFile} activePath={null} />);
    await screen.findByText("a.txt"); // 确保树加载
    const row = screen.getByText("（cwd）").closest(".group")!;
    fireEvent.mouseEnter(row);
    const newBtn = row.querySelector('button[title="新建文件"]');
    expect(newBtn).toBeTruthy();
    fireEvent.click(newBtn!);
    const input = await screen.findByPlaceholderText("名称");
    fireEvent.change(input, { target: { value: "new.ts" } });
    fireEvent.click(screen.getByText("创建"));
    await waitFor(() => {
      expect(calls.some((c) => c.startsWith("pi:touch") && c.includes("new.ts"))).toBe(true);
    });
    expect(onOpenFile).toHaveBeenCalledWith("new.ts", "new.ts", false);
  });

  it("删除：确认弹窗 → pi:delete 调用", async () => {
    const user = userEvent.setup();
    const calls: string[] = [];
    render(<FilesTree request={opRequest(calls)} onOpenFile={vi.fn()} activePath={null} />);
    await user.click(await screen.findByText("a.txt"));
    const row = screen.getByText("a.txt").closest(".group");
    fireEvent.mouseEnter(row!);
    fireEvent.click(row!.querySelector('button[title="删除"]')!);
    expect(await screen.findByText(/删除 a\.txt/)).toBeTruthy();
    fireEvent.click(screen.getByText("删除"));
    await waitFor(() => {
      expect(calls.some((c) => c.startsWith("pi:delete"))).toBe(true);
    });
  });
});

describe("review 回归：Enter 键正式打开", () => {
  afterEach(cleanup);

  it("选中文件后按 Enter → onOpenFile(preview=false)", async () => {
    const user = userEvent.setup();
    const onOpenFile = vi.fn();
    render(<FilesTree request={fakeRequest({ "a.txt": "hello" })} onOpenFile={onOpenFile} activePath="a.txt" />);
    await screen.findByText("a.txt");
    const tree = document.querySelector(".scrollbar-thin.scrollbar-gutter-stable.min-h-0")!;
    fireEvent.keyDown(tree, { key: "Enter" });
    expect(onOpenFile).toHaveBeenLastCalledWith("a.txt", "a.txt", false);
  });
});
