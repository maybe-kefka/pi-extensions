// @vitest-environment jsdom
// GitPanel 多仓库列表测试：空态/多项/brief 徽标/展开折叠/刷新
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { GitPanel, RepoItem, type GitStatusEntry, type RepoInfo } from "./GitPanel";
import type { RpcClient } from "@/shared/api/rpc";

const REPOS: RepoInfo[] = [
  { root: "", name: "pi-extensions", branch: "main", ahead: 2, behind: 1 },
  { root: "packages/pi-web", name: "pi-web", branch: "feat", ahead: 0, behind: 0 },
];

function makeRequest(repos: RepoInfo[] | null, calls: string[] = []) {
  const request = (async (method: string, params: Record<string, unknown> = {}) => {
    calls.push(`${method}:${JSON.stringify(params)}`);
    if (method === "pi:gitRepos") {
      if (repos === null) throw new Error("boom");
      return { repos };
    }
    if (method === "pi:gitStatus") return { isRepo: true, entries: [], aggregated: {} };
    throw new Error(`unexpected ${method}`);
  }) as RpcClient["request"];
  return { request, calls };
}

describe("GitPanel 多仓库列表", () => {
  afterEach(cleanup);

  it("多 repo 列表渲染（含 brief 徽标：↓/↑/分支）", async () => {
    const { request } = makeRequest(REPOS);
    render(<GitPanel request={request} />);
    expect(await screen.findByText("pi-extensions")).toBeTruthy();
    expect(screen.getByText("pi-web")).toBeTruthy();
    expect(screen.getByTitle("可拉取 1")).toBeTruthy();
    expect(screen.getByTitle("可推送 2")).toBeTruthy();
    expect(screen.getByText("feat")).toBeTruthy();
  });

  it("无仓库显示空态", async () => {
    const { request } = makeRequest([]);
    render(<GitPanel request={request} />);
    expect(await screen.findByText("未找到 git 仓库")).toBeTruthy();
  });

  it("加载失败也显示空态", async () => {
    const { request } = makeRequest(null);
    render(<GitPanel request={request} />);
    expect(await screen.findByText("未找到 git 仓库")).toBeTruthy();
  });

  it("点击行展开/折叠", async () => {
    const { request } = makeRequest(REPOS);
    render(<GitPanel request={request} />);
    await screen.findByText("pi-extensions");
    const row = screen.getByText("pi-extensions").closest(".group, div")!;
    fireEvent.click(row.querySelector('button[title="展开"]')!);
    expect(await screen.findByText("工作区干净")).toBeTruthy();
  });

  it("刷新按钮触发重扫", async () => {
    const calls: string[] = [];
    const { request } = makeRequest(REPOS, calls);
    render(<GitPanel request={request} />);
    await screen.findByText("pi-extensions");
    fireEvent.click(screen.getByTitle("重新扫描仓库"));
    await waitFor(() => {
      expect(calls.filter((c) => c.startsWith("pi:gitRepos")).length).toBeGreaterThanOrEqual(2);
    });
  });
});

describe("RepoItem", () => {
  afterEach(cleanup);

  it("brief 行渲染仓库名/分支/徽标/展开与更多按钮", () => {
    const { request } = makeRequest(REPOS);
    render(<RepoItem repo={REPOS[0]} request={request} />);
    expect(screen.getByText("pi-extensions")).toBeTruthy();
    expect(screen.getByText("main")).toBeTruthy();
    expect(screen.getByTitle("展开")).toBeTruthy();
    expect(screen.getByTitle("更多操作")).toBeTruthy();
    expect(screen.getByTitle("刷新")).toBeTruthy();
  });
});

describe("RepoItem 展开区", () => {
  afterEach(cleanup);

  function wsRequest(calls: string[], entries: GitStatusEntry[] = []) {
    const request = (async (method: string, params: Record<string, unknown> = {}) => {
      calls.push(`${method}:${JSON.stringify(params)}`);
      if (method === "pi:gitRepos") return { repos: REPOS };
      if (method === "pi:gitStatus") return { isRepo: true, entries, aggregated: {} };
      if (method === "pi:gitStage" || method === "pi:gitUnstage" || method === "pi:gitCommit") return { ok: true };
      throw new Error(`unexpected ${method}`);
    }) as RpcClient["request"];
    return { request, calls };
  }

  const entries: GitStatusEntry[] = [
    { path: "staged.ts", status: "M", staged: true },
    { path: "work.ts", status: "M", staged: false },
    { path: "new.ts", status: "??", staged: false },
  ];

  it("展开显示两区与文件行", async () => {
    const { request } = wsRequest([], entries);
    render(<GitPanel request={request} />);
    await screen.findByText("pi-extensions");
    fireEvent.click(screen.getAllByTitle("展开")[0]);
    expect(await screen.findByText("未暂存（2）")).toBeTruthy();
    expect(screen.getByText("已暂存（1）")).toBeTruthy();
    expect(screen.getByText("work.ts")).toBeTruthy();
    expect(screen.getByText("staged.ts")).toBeTruthy();
  });

  it("暂存文件 → pi:gitStage（带 repoRoot）", async () => {
    const calls: string[] = [];
    const { request } = wsRequest(calls, entries);
    render(<GitPanel request={request} />);
    await screen.findByText("pi-extensions");
    fireEvent.click(screen.getAllByTitle("展开")[0]);
    await screen.findByText("work.ts");
    const row = screen.getByText("work.ts").closest(".group, div")!;
    fireEvent.click(row.querySelector('button[title="暂存"]')!);
    await waitFor(() => {
      expect(calls.some((c) => c.startsWith("pi:gitStage") && c.includes("work.ts"))).toBe(true);
    });
  });

  it("取消暂存 → pi:gitUnstage", async () => {
    const calls: string[] = [];
    const { request } = wsRequest(calls, entries);
    render(<GitPanel request={request} />);
    await screen.findByText("pi-extensions");
    fireEvent.click(screen.getAllByTitle("展开")[0]);
    await screen.findByText("staged.ts");
    const row = screen.getByText("staged.ts").closest(".group, div")!;
    fireEvent.click(row.querySelector('button[title="取消暂存"]')!);
    await waitFor(() => {
      expect(calls.some((c) => c.startsWith("pi:gitUnstage") && c.includes("staged.ts"))).toBe(true);
    });
  });

  it("有 staged：输入 message 提交（不弹确认）", async () => {
    const calls: string[] = [];
    const { request } = wsRequest(calls, entries);
    render(<GitPanel request={request} />);
    await screen.findByText("pi-extensions");
    fireEvent.click(screen.getAllByTitle("展开")[0]);
    await screen.findByText("staged.ts");
    fireEvent.change(screen.getByPlaceholderText(/提交信息/), { target: { value: "feat: x" } });
    fireEvent.click(screen.getByText("提交"));
    await waitFor(() => {
      expect(calls.some((c) => c.startsWith("pi:gitCommit") && c.includes("feat: x"))).toBe(true);
    });
    expect(screen.queryByText("提交所有工作区文件？")).toBeNull();
  });

  it("无 staged：提交弹确认 → 确认后 stage 全部再提交", async () => {
    const calls: string[] = [];
    const { request } = wsRequest(calls, [{ path: "work.ts", status: "M", staged: false }]);
    render(<GitPanel request={request} />);
    await screen.findByText("pi-extensions");
    fireEvent.click(screen.getAllByTitle("展开")[0]);
    await screen.findByText("work.ts");
    fireEvent.change(screen.getByPlaceholderText(/提交信息/), { target: { value: "feat: all" } });
    fireEvent.click(screen.getByText("提交"));
    expect(await screen.findByText("提交所有工作区文件？")).toBeTruthy();
    fireEvent.click(screen.getByText("确认提交全部"));
    await waitFor(() => {
      expect(calls.some((c) => c.startsWith("pi:gitStage") && c.includes('"all":true'))).toBe(true);
      expect(calls.some((c) => c.startsWith("pi:gitCommit"))).toBe(true);
    });
  });

  it("点击文件行 → onOpenFile", async () => {
    const { request } = wsRequest([], entries);
    const onOpenFile = vi.fn();
    render(<GitPanel request={request} onOpenFile={onOpenFile} />);
    await screen.findByText("pi-extensions");
    fireEvent.click(screen.getAllByTitle("展开")[0]);
    await screen.findByText("work.ts");
    fireEvent.click(screen.getByText("work.ts"));
    expect(onOpenFile).toHaveBeenCalledWith("work.ts");
  });
});

describe("RepoItem popover 工具栏", () => {
  afterEach(cleanup);

  function toolRequest(calls: string[]) {
    const request = (async (method: string, params: Record<string, unknown> = {}) => {
      calls.push(`${method}:${JSON.stringify(params)}`);
      if (method === "pi:gitRepos") return { repos: REPOS };
      if (method === "pi:gitStatus") return { isRepo: true, entries: [], aggregated: {} };
      if (method === "pi:gitBranches") return { isRepo: true, current: "main", branches: ["main", "feat"] };
      if (method === "pi:gitSwitch" || method === "pi:gitBranchCreate" || method === "pi:gitBranchDelete" || method === "pi:gitMerge" || method === "pi:gitRebase" || method === "pi:gitPush" || method === "pi:gitPull" || method === "pi:gitStash") {
        return { ok: true };
      }
      throw new Error(`unexpected ${method}`);
    }) as RpcClient["request"];
    return { request, calls };
  }

  it("⋮ 打开 popover：三分区渲染（分支/远程/stash）", async () => {
    const { request } = toolRequest([]);
    render(<GitPanel request={request} />);
    await screen.findByText("pi-extensions");
    fireEvent.click(screen.getAllByTitle("更多操作")[0]);
    expect(await screen.findByText("feat")).toBeTruthy();
    expect(screen.getByText("远程")).toBeTruthy();
    expect(screen.getByText("stash")).toBeTruthy();
    expect(screen.getByText("拉取")).toBeTruthy();
    expect(screen.getByTitle("暂存全部改动")).toBeTruthy();
  });

  it("popover 中切换分支 → pi:gitSwitch（带 repoRoot）", async () => {
    const calls: string[] = [];
    const { request } = toolRequest(calls);
    render(<GitPanel request={request} />);
    await screen.findByText("pi-extensions");
    fireEvent.click(screen.getAllByTitle("更多操作")[0]);
    await screen.findByText("feat");
    // 多个 feat（repo-b 分支徽标 + popover 列表）——点 popover 里的（最后一个）
    const feats = screen.getAllByText("feat");
    fireEvent.click(feats[feats.length - 1]);
    await waitFor(() => {
      expect(calls.some((c) => c.startsWith("pi:gitSwitch") && c.includes("feat"))).toBe(true);
    });
  });

  it("push/pull/stash 按钮触发对应 RPC", async () => {
    const calls: string[] = [];
    const { request } = toolRequest(calls);
    render(<GitPanel request={request} />);
    await screen.findByText("pi-extensions");
    fireEvent.click(screen.getAllByTitle("更多操作")[0]);
    await screen.findByText("远程");
    fireEvent.click(screen.getByText("拉取"));
    fireEvent.click(screen.getByText("推送"));
    fireEvent.click(screen.getByTitle("暂存全部改动"));
    await waitFor(() => {
      expect(calls.some((c) => c.startsWith("pi:gitPull"))).toBe(true);
      expect(calls.some((c) => c.startsWith("pi:gitPush"))).toBe(true);
      expect(calls.some((c) => c.startsWith("pi:gitStash"))).toBe(true);
    });
  });
});
