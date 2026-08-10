// @vitest-environment jsdom
// FilesTree 渲染测试（jsdom）：目录树浏览 + 打开文件回调 + 错误提示
// CodeMirror 在 jsdom 缺 getClientRects —— mock 为纯文本容器（编辑器内部不测）
vi.mock("@uiw/react-codemirror", () => ({
  default: ({ value }: { value: string }) => <div data-testid="cm">{value}</div>,
}));
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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

  it("点击文件回调 onOpenFile（含文件名）", async () => {
    const user = userEvent.setup();
    const onOpenFile = vi.fn();
    render(<FilesTree request={fakeRequest({ "a.txt": "hello world" })} onOpenFile={onOpenFile} activePath={null} />);
    await user.click(await screen.findByText("a.txt"));
    expect(onOpenFile).toHaveBeenCalledWith("a.txt", "a.txt");
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
