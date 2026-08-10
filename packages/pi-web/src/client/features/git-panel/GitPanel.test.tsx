// @vitest-environment jsdom
// GitPanel 渲染测试：分支列表/当前高亮/切换/确认弹窗
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { GitPanel } from "./GitPanel";
import { Toaster } from "@/shared/ui/sonner";
import type { RpcClient } from "@/shared/api/rpc";

function makeRequest(calls: string[], overrides: Record<string, unknown> = {}) {
  const request = (async (method: string, params: Record<string, unknown> = {}) => {
    calls.push(`${method}:${JSON.stringify(params)}`);
    if (method === "pi:gitBranches") {
      return overrides.gitBranches ?? { isRepo: true, current: "main", branches: ["main", "feat", "fix/1"] };
    }
    if (method === "pi:gitSwitch" || method === "pi:gitMerge" || method === "pi:gitRebase" || method === "pi:gitBranchDelete" || method === "pi:gitBranchCreate") {
      if (typeof overrides.fail === "string") throw new Error(overrides.fail);
      return { ok: true };
    }
    throw new Error(`unexpected ${method}`);
  }) as RpcClient["request"];
  return { request, calls };
}

describe("GitPanel 分支管理", () => {
  afterEach(cleanup);

  it("渲染分支列表与当前分支高亮", async () => {
    const { request } = makeRequest([]);
    render(<GitPanel request={request} />);
    expect(await screen.findByText("feat")).toBeTruthy();
    expect(screen.getByText("fix/1")).toBeTruthy();
    // 当前分支高亮（title=当前分支）
    const cur = screen.getByTitle("当前分支");
    expect(cur.textContent).toContain("main");
  });

  it("点击分支发起切换（当前分支不可点）", async () => {
    const calls: string[] = [];
    const { request } = makeRequest(calls);
    render(<GitPanel request={request} />);
    await screen.findByText("feat");
    fireEvent.click(screen.getByText("feat"));
    await waitFor(() => {
      expect(calls.some((c) => c.startsWith("pi:gitSwitch") && c.includes("feat"))).toBe(true);
    });
  });

  it("切换失败展示错误", async () => {
    const { request } = makeRequest([], { fail: "error: pathspec did not match" });
    render(
      <>
        <GitPanel request={request} />
        <Toaster position="top-right" />
      </>,
    );
    await screen.findByText("feat");
    fireEvent.click(screen.getByText("feat"));
    await waitFor(() => {
      expect(screen.getByText(/切换失败/)).toBeTruthy();
    });
  });

  it("删除分支：行按钮 → 确认弹窗 → 确认执行", async () => {
    const calls: string[] = [];
    const { request } = makeRequest(calls);
    render(<GitPanel request={request} />);
    await screen.findByText("feat");
    const row = screen.getByText("feat").closest(".group")!;
    fireEvent.click(row.querySelector('button[title="删除分支"]')!);
    expect(await screen.findByText(/删除分支 feat/)).toBeTruthy();
    fireEvent.click(screen.getByText("确认"));
    await waitFor(() => {
      expect(calls.some((c) => c.startsWith("pi:gitBranchDelete") && c.includes("feat"))).toBe(true);
    });
  });

  it("合并分支：确认弹窗 → 执行", async () => {
    const calls: string[] = [];
    const { request } = makeRequest(calls);
    render(<GitPanel request={request} />);
    await screen.findByText("feat");
    const row = screen.getByText("feat").closest(".group")!;
    fireEvent.click(row.querySelector('button[title="合并到当前分支"]')!);
    expect(await screen.findByText(/将 feat 合并到 main/)).toBeTruthy();
    fireEvent.click(screen.getByText("确认"));
    await waitFor(() => {
      expect(calls.some((c) => c.startsWith("pi:gitMerge"))).toBe(true);
    });
  });

  it("新建分支：弹窗输入 → 创建", async () => {
    const calls: string[] = [];
    const { request } = makeRequest(calls);
    render(<GitPanel request={request} />);
    await screen.findByText("feat");
    fireEvent.click(screen.getByTitle("新建分支"));
    const input = await screen.findByPlaceholderText("分支名");
    fireEvent.change(input, { target: { value: "hotfix" } });
    fireEvent.click(screen.getByText("创建"));
    await waitFor(() => {
      expect(calls.some((c) => c.startsWith("pi:gitBranchCreate") && c.includes("hotfix"))).toBe(true);
    });
  });
});
