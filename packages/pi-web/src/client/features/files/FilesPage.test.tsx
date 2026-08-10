// @vitest-environment jsdom
// FilesPage 渲染测试（jsdom）：目录树浏览 + 打开文件 + 错误提示
// CodeMirror 在 jsdom 缺 getClientRects —— mock 为纯文本容器（编辑器内部不测）
vi.mock("@uiw/react-codemirror", () => ({
  default: ({ value }: { value: string }) => <div data-testid="cm">{value}</div>,
}));
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FilesPage } from "./FilesPage";
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
  return async (method, params = {}) => {
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
  };
}

describe("FilesPage", () => {
  it("首屏加载根目录并显示条目", async () => {
    render(<FilesPage request={fakeRequest({ "README.md": "hi", "src/main.ts": "x" })} />);
    expect(await screen.findByText("README.md")).toBeTruthy();
    expect(screen.getByText("src")).toBeTruthy();
  });

  it("展开目录后显示子文件", async () => {
    const user = userEvent.setup();
    render(<FilesPage request={fakeRequest({ "src/main.ts": "x" })} />);
    await user.click(await screen.findByText("src"));
    expect(await screen.findByText("main.ts")).toBeTruthy();
  });

  it("点击文件发起 readFile 并显示内容", async () => {
    const user = userEvent.setup();
    render(<FilesPage request={fakeRequest({ "a.txt": "hello world" })} />);
    await user.click(await screen.findByText("a.txt"));
    expect(await screen.findByTestId("cm")).toBeTruthy();
    expect(screen.getByText("hello world")).toBeTruthy();
  });

  it("readFile 失败显示错误提示", async () => {
    const user = userEvent.setup();
    const request = (async (method: string) => {
      if (method === "pi:listDir") return { entries: [{ name: "secret.txt", type: "file", size: 1, mtimeMs: 1 }] };
      throw new Error("文件不存在或越权：secret.txt");
    }) as RpcClient["request"];
    render(<FilesPage request={request} />);
    await user.click(await screen.findByText("secret.txt"));
    expect(await screen.findByText(/文件不存在或越权/)).toBeTruthy();
  });
});
