// @vitest-environment jsdom
// GitPanel 多仓库列表测试：空态/多项/brief 徽标/展开折叠/刷新
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { GitPanel, RepoItem, type RepoInfo } from "./GitPanel";
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
    expect(screen.getByText(/工作区变更区/)).toBeTruthy();
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
