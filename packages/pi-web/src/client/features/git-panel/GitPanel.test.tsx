// @vitest-environment jsdom
// GitPanel 多仓库列表测试：空态/多项/brief 徽标/展开折叠/刷新
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { GitPanel, RepoItem, type GitStatusEntry, type RepoInfo } from "./GitPanel";
import type { RpcClient } from "@/shared/api";

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
    expect(onOpenFile).toHaveBeenCalledWith("work.ts", "");
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

describe("review 回归：分支选择与 sibling actions 可达", () => {
  afterEach(cleanup);

  it("分支选择是独立按钮，action 不触发分支切换", async () => {
    const calls: string[] = [];
    const request = (async (method: string) => {
      calls.push(method);
      if (method === "pi:gitRepos") return { repos: REPOS };
      if (method === "pi:gitStatus") return { isRepo: true, entries: [], aggregated: {} };
      if (method === "pi:gitBranches") return { isRepo: true, current: "main", branches: ["main", "feat"] };
      throw new Error(`unexpected ${method}`);
    }) as RpcClient["request"];
    render(<GitPanel request={request} />);
    await screen.findByText("pi-extensions");
    fireEvent.click(screen.getAllByTitle("更多操作")[0]);
    await screen.findByText("feat");
    expect(screen.getByRole("button", { name: "切换到 feat" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "合并 feat" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "rebase feat" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "删除分支 feat" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "合并 feat" }));
    expect(calls.some((method) => method === "pi:gitSwitch")).toBe(false);
    expect(await screen.findByRole("dialog")).toBeTruthy();
  });
});

describe("review/ticket04 回归：commit 触发键", () => {
  afterEach(cleanup);

  function renderWithStaged() {
    const calls: Array<{ m: string; p: unknown }> = [];
    const request = (async (m: string, p?: unknown) => {
      calls.push({ m, p });
      if (m === "pi:gitRepos") return { repos: REPOS };
      if (m === "pi:gitStatus") return { isRepo: true, entries: [{ path: "a.ts", status: "M", staged: true }], aggregated: {} };
      if (m === "pi:gitBranches") return { isRepo: true, current: "main", branches: ["main"] };
      if (m === "pi:gitCommit") return { ok: true };
      if (m === "pi:gitRepos") return { repos: REPOS };
      throw new Error(`unexpected ${m}`);
    }) as RpcClient["request"];
    const ui = render(<GitPanel request={request} />);
    return { calls, ui };
  }

  it("Enter 不触发提交（换行）；Shift+Enter 触发", async () => {
    const { calls } = renderWithStaged();
    await screen.findByText("pi-extensions");
    fireEvent.click(screen.getAllByTitle("展开")[0]);
    const ta = await screen.findByPlaceholderText(/提交信息/);
    fireEvent.change(ta, { target: { value: "feat: x" } });
    fireEvent.keyDown(ta, { key: "Enter" });
    expect(calls.some((c) => c.m === "pi:gitCommit")).toBe(false);
    fireEvent.keyDown(ta, { key: "Enter", shiftKey: true });
    expect(calls.some((c) => c.m === "pi:gitCommit")).toBe(true);
  });
});

describe("ticket06：分支选择弹窗", () => {
  afterEach(cleanup);

  function renderPicker(overrides: Record<string, unknown> = {}) {
    const calls: string[] = [];
    const request = (async (method: string, params: Record<string, unknown> = {}) => {
      calls.push(`${method}:${JSON.stringify(params)}`);
      if (method === "pi:gitRepos") return { repos: REPOS };
      if (method === "pi:gitStatus") return { isRepo: true, entries: [], aggregated: {} };
      if (method === "pi:gitBranches")
        return { isRepo: true, current: "main", branches: ["main", "feat"], remotes: ["origin/main", "origin/dev"], ...overrides };
      if (method === "pi:gitSwitch") return { ok: true };
      if (method === "pi:gitSwitchRemote") return { ok: true };
      if (method === "pi:gitCreateBranch") return { ok: true };
      throw new Error(`unexpected ${method}`);
    }) as RpcClient["request"];
    const ui = render(<GitPanel request={request} />);
    return { calls, request, ...ui };
  }

  it("点分支名徽标 → 弹窗出现（本地/远程分组，当前分支不可点）", async () => {
    renderPicker();
    await screen.findByText("pi-extensions");
    fireEvent.click(screen.getByTitle(/当前分支 main/));
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(await screen.findByText("本地分支")).toBeTruthy();
    expect(screen.getByText("远程分支")).toBeTruthy();
    expect(await screen.findByText("origin/dev")).toBeTruthy();
    // 弹窗内的 feat 列表项（另一个 repo 的徽标也叫 feat——取 dialog 内的）
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getAllByText("feat").length).toBeGreaterThan(0);
    // 当前分支 main 标记且不可点（Check 图标）
    const mainItem = within(dialog).getAllByText("main")[0];
    expect(mainItem.closest("button")?.disabled).toBe(true);
  });

  it("点本地分支 → pi:gitSwitch + 弹窗关闭", async () => {
    const { calls } = renderPicker();
    await screen.findByText("pi-extensions");
    fireEvent.click(screen.getByTitle(/当前分支 main/));
    await screen.findByRole("dialog");
    const dialog = await screen.findByRole("dialog");
    const featItem = within(dialog).getAllByText("feat")[0];
    fireEvent.click(featItem.closest("button")!);
    await waitFor(() => expect(calls.some((c) => c.startsWith("pi:gitSwitch:"))).toBe(true));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("点远程分支 → pi:gitSwitchRemote（创建跟踪分支并切换）", async () => {
    const { calls } = renderPicker();
    await screen.findByText("pi-extensions");
    fireEvent.click(screen.getByTitle(/当前分支 main/));
    await screen.findByRole("dialog");
    fireEvent.click(await screen.findByText("origin/dev"));
    await waitFor(() => expect(calls.some((c) => c.startsWith("pi:gitSwitchRemote:"))).toBe(true));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("输入不存在的新名回车 → 内联'从哪个分支创建' → 确认 → pi:gitCreateBranch", async () => {
    const { calls } = renderPicker();
    await screen.findByText("pi-extensions");
    fireEvent.click(screen.getByTitle(/当前分支 main/));
    await screen.findByRole("dialog");
    fireEvent.change(screen.getByPlaceholderText(/分支名/), { target: { value: "hotfix" } });
    fireEvent.keyDown(screen.getByPlaceholderText(/分支名/), { key: "Enter" });
    expect(await screen.findByText(/从哪个分支创建/)).toBeTruthy();
    // base 列表含本地+远程
    fireEvent.click(within(screen.getByRole("dialog")).getByText("origin/main"));
    fireEvent.click(screen.getByRole("button", { name: "创建" }));
    expect(calls.some((c) => c.includes("pi:gitCreateBranch") && c.includes("hotfix") && c.includes("origin/main"))).toBe(true);
  });
});

describe("ticket07：popover 管理区只列本地分支", () => {
  afterEach(cleanup);

  it("popover 分支列表不渲染远程分支（remotes 不出现）", async () => {
    const request = (async (method: string, params: Record<string, unknown> = {}) => {
      if (method === "pi:gitRepos") return { repos: REPOS };
      if (method === "pi:gitStatus") return { isRepo: true, entries: [], aggregated: {} };
      if (method === "pi:gitBranches")
        return { isRepo: true, current: "main", branches: ["main", "feat"], remotes: ["origin/main", "origin/dev"] };
      throw new Error(`unexpected ${method}`);
    }) as RpcClient["request"];
    render(<GitPanel request={request} />);
    await screen.findByText("pi-extensions");
    fireEvent.click(screen.getAllByTitle("更多操作")[0]);
    expect(await screen.findByText("feat")).toBeTruthy();
    expect(screen.queryByText("origin/dev")).toBeNull();
    expect(screen.queryByText("origin/main")).toBeNull();
  });
});

describe("review 回归：收起态不渲染展开区", () => {
  afterEach(cleanup);

  it("repo 收起时未暂存/已暂存列表均不显示（未暂存块在 expanded 内）", async () => {
    const request = (async (method: string, params: Record<string, unknown> = {}) => {
      if (method === "pi:gitRepos") return { repos: REPOS };
      if (method === "pi:gitStatus")
        return { isRepo: true, entries: [{ path: "w.ts", status: "M", staged: false }, { path: "s.ts", status: "M", staged: true }], aggregated: {} };
      if (method === "pi:gitBranches") return { isRepo: true, current: "main", branches: ["main"] };
      throw new Error(`unexpected ${method}`);
    }) as RpcClient["request"];
    render(<GitPanel request={request} />);
    await screen.findByText("pi-extensions");
    // 默认收起：展开区内容不渲染（未暂存/已暂存均不出现）
    expect(screen.queryByText(/未暂存/)).toBeNull();
    expect(screen.queryByText(/已暂存/)).toBeNull();
    // 展开后出现
    fireEvent.click(screen.getAllByTitle("展开")[0]);
    expect(await screen.findByText(/已暂存（1）/)).toBeTruthy();
    expect(screen.getByText(/未暂存（1）/)).toBeTruthy();
  });
});
