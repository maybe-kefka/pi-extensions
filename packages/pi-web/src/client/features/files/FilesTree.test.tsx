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
import { buildFileMenuItems } from "./TreeView";
import type { RpcClient } from "@/shared/api";

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

  it("右键菜单：目录行渲染完整菜单项（新建/重命名/删除/复制路径）", async () => {
    const calls: string[] = [];
    render(<FilesTree request={opRequest(calls)} onOpenFile={vi.fn()} activePath={null} />);
    await screen.findByText("a.txt"); // 确保树加载
    const row = screen.getByText("（cwd）").closest("button")!;
    fireEvent.contextMenu(row);
    expect(await screen.findByText("新建文件")).toBeTruthy();
    expect(screen.getByText("新建文件夹")).toBeTruthy();
    expect(screen.getByText("重命名")).toBeTruthy();
    expect(screen.getByText("删除")).toBeTruthy();
    expect(screen.getByText("复制路径")).toBeTruthy();
  });

  it("右键菜单：文件行渲染打开/diff/管理菜单项", async () => {
    const calls: string[] = [];
    render(<FilesTree request={opRequest(calls)} onOpenFile={vi.fn()} activePath={null} />);
    await screen.findByText("a.txt");
    const row = screen.getByText("a.txt").closest("button")!;
    fireEvent.contextMenu(row);
    expect(await screen.findByText("打开")).toBeTruthy();
    expect(screen.getByText("打开 diff")).toBeTruthy();
    expect(screen.getByText("重命名")).toBeTruthy();
    expect(screen.getByText("删除")).toBeTruthy();
    expect(screen.getByText("复制路径")).toBeTruthy();
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

describe("buildFileMenuItems 回调映射", () => {
  const handlers = {
    onOpenFile: vi.fn(), onOpenDiff: vi.fn(), onRenameStart: vi.fn(), onDelete: vi.fn(),
    onNewFile: vi.fn(), onNewDir: vi.fn(), onCopyPath: vi.fn(),
  };

  it("文件节点：打开/打开 diff/重命名/删除/复制路径 → 对应回调", () => {
    const items = buildFileMenuItems({ isDir: false, dir: "", path: "a.txt", ...handlers });
    const byLabel = Object.fromEntries(items.map((m) => [m.label, m.onSelect]));
    byLabel["打开"]();
    expect(handlers.onOpenFile).toHaveBeenCalledWith("a.txt", false);
    byLabel["打开 diff"]();
    expect(handlers.onOpenDiff).toHaveBeenCalledWith("a.txt");
    byLabel["重命名"]();
    expect(handlers.onRenameStart).toHaveBeenCalledWith("a.txt");
    byLabel["删除"]();
    expect(handlers.onDelete).toHaveBeenCalledWith("a.txt");
    byLabel["复制路径"]();
    expect(handlers.onCopyPath).toHaveBeenCalledWith("a.txt");
  });

  it("目录节点：新建文件/新建文件夹 → 回调带目录路径", () => {
    const items = buildFileMenuItems({ isDir: true, dir: "src", path: "src", ...handlers });
    const byLabel = Object.fromEntries(items.map((m) => [m.label, m.onSelect]));
    byLabel["新建文件"]();
    expect(handlers.onNewFile).toHaveBeenCalledWith("src");
    byLabel["新建文件夹"]();
    expect(handlers.onNewDir).toHaveBeenCalledWith("src");
  });
});
