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
    if (method === "pi:gitStatus") {
      return overrides.gitStatus ?? { isRepo: true, entries: [], aggregated: {} };
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

describe("GitPanel staging/commit", () => {
  afterEach(cleanup);

  function scRequest(calls: string[]) {
    const request = (async (method: string, params: Record<string, unknown> = {}) => {
      calls.push(`${method}:${JSON.stringify(params)}`);
      if (method === "pi:gitBranches") return { isRepo: true, current: "main", branches: ["main"] };
      if (method === "pi:gitStatus") {
        return {
          isRepo: true,
          entries: [
            { path: "staged.ts", status: "M", staged: true },
            { path: "work.ts", status: "M", staged: false },
            { path: "new.ts", status: "??", staged: false },
          ],
          aggregated: {},
        };
      }
      if (method === "pi:gitStage" || method === "pi:gitUnstage" || method === "pi:gitCommit") return { ok: true };
      throw new Error(`unexpected ${method}`);
    }) as RpcClient["request"];
    return { request, calls };
  }

  it("改动列表分组渲染（staged 在前）+ 行操作按钮", async () => {
    const { request } = scRequest([]);
    render(<GitPanel request={request} />);
    expect(await screen.findByText("staged.ts")).toBeTruthy();
    expect(screen.getByText("work.ts")).toBeTruthy();
    expect(screen.getByText("new.ts")).toBeTruthy();
    expect(screen.getByTitle("取消暂存")).toBeTruthy();
    expect(screen.getAllByTitle("暂存").length).toBe(2);
  });

  it("暂存单文件 → pi:gitStage", async () => {
    const calls: string[] = [];
    const { request } = scRequest(calls);
    render(<GitPanel request={request} />);
    await screen.findByText("work.ts");
    const row = screen.getByText("work.ts").closest(".group")!;
    fireEvent.click(row.querySelector('button[title="暂存"]')!);
    await waitFor(() => {
      expect(calls.some((c) => c.startsWith("pi:gitStage") && c.includes("work.ts"))).toBe(true);
    });
  });

  it("取消暂存 → pi:gitUnstage", async () => {
    const calls: string[] = [];
    const { request } = scRequest(calls);
    render(<GitPanel request={request} />);
    await screen.findByText("staged.ts");
    const row = screen.getByText("staged.ts").closest(".group")!;
    fireEvent.click(row.querySelector('button[title="取消暂存"]')!);
    await waitFor(() => {
      expect(calls.some((c) => c.startsWith("pi:gitUnstage"))).toBe(true);
    });
  });

  it("commit：空 message 禁用；有 staged + message 才可提交", async () => {
    const calls: string[] = [];
    const { request } = scRequest(calls);
    render(<GitPanel request={request} />);
    await screen.findByText("staged.ts");
    expect((screen.getByText("提交") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText(/提交信息/), { target: { value: "feat: smoke" } });
    expect((screen.getByText("提交") as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByText("提交"));
    await waitFor(() => {
      expect(calls.some((c) => c.startsWith("pi:gitCommit") && c.includes("feat: smoke"))).toBe(true);
    });
  });

  it("点击改动文件 → onOpenFile", async () => {
    const calls: string[] = [];
    const { request } = scRequest(calls);
    const onOpenFile = vi.fn();
    render(<GitPanel request={request} onOpenFile={onOpenFile} />);
    await screen.findByText("work.ts");
    fireEvent.click(screen.getByText("work.ts"));
    expect(onOpenFile).toHaveBeenCalledWith("work.ts");
  });
});
