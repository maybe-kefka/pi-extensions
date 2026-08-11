// @vitest-environment jsdom
// DiffSplitView 测试：双数据源加载 + 行对齐渲染（ctx/del/add）
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { DiffSplitView } from "./DiffSplitView";
import type { RpcClient } from "@/shared/api";

function makeRequest(overrides: { head?: string; work?: string; hunks?: unknown[] } = {}) {
  const calls: string[] = [];
  const request = (async (method: string, params: Record<string, unknown> = {}) => {
    calls.push(method);
    if (method === "pi:gitShowHead") return { content: overrides.head ?? "old" };
    if (method === "pi:readFile") return { content: overrides.work ?? "new", mode: "text", size: 3, mtimeMs: 1, hash: "h" };
    if (method === "pi:gitDiff") {
      return {
        isRepo: true,
        diff:
          overrides.hunks ??
          [
            {
              header: "@@ -1 +1 @@",
              lines: [
                { type: "del", text: "old" },
                { type: "add", text: "new" },
              ],
            },
          ],
      };
    }
    throw new Error(`unexpected ${method}`);
  }) as RpcClient["request"];
  return { request, calls };
}

describe("DiffSplitView", () => {
  afterEach(cleanup);

  it("加载双数据源（gitShowHead + readFile + gitDiff）", async () => {
    const { request, calls } = makeRequest();
    render(<DiffSplitView path="a.ts" request={request} />);
    await waitFor(() => {
      expect(calls).toContain("pi:gitShowHead");
      expect(calls).toContain("pi:readFile");
      expect(calls).toContain("pi:gitDiff");
    });
  });

  it("行对齐渲染：del 行在左、add 行在右、ctx 行两边", async () => {
    const { request } = makeRequest({
      hunks: [
        {
          header: "@@ -1,3 +1,3 @@",
          lines: [
            { type: "ctx", text: "common" },
            { type: "del", text: "old" },
            { type: "add", text: "new" },
          ],
        },
      ],
    });
    render(<DiffSplitView path="a.ts" request={request} />);
    await waitFor(() => {
      expect(screen.getAllByText("common").length).toBe(2);
    });
    // 左栏 del 标记
    expect(screen.getByTitle("左侧删除")).toBeTruthy();
    expect(screen.getByTitle("右侧新增")).toBeTruthy();
  });

  it("HEAD 缺失（新文件）显示错误态", async () => {
    const request = (async (method: string) => {
      if (method === "pi:gitShowHead") throw new Error("HEAD 中无此文件");
      if (method === "pi:readFile") return { content: "new", mode: "text", size: 3, mtimeMs: 1, hash: "h" };
      if (method === "pi:gitDiff") return { isRepo: true, diff: null };
      throw new Error(`unexpected ${method}`);
    }) as RpcClient["request"];
    render(<DiffSplitView path="new.ts" request={request} />);
    expect(await screen.findByText(/HEAD 中无此文件/)).toBeTruthy();
  });
});
