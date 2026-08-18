// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SessionList } from "./SessionList";

describe("SessionList", () => {
  afterEach(cleanup);

  it("主标题 button 可选择，长标题保留完整 accessible name 与 tooltip", () => {
    const onSelect = vi.fn();
    const name = "A session title that is deliberately much longer than the compact panel width";
    render(
      <SessionList
        sessions={[{ path: "/tmp/session.jsonl", name, cwd: "/tmp", messageCount: 3, firstMessage: "", modified: "" }]}
        currentSessionFile={null}
        openSessionFiles={new Set()}
        degraded={false}
        actions={{ onSelect, onNew: vi.fn(), onDelete: vi.fn(), onRename: vi.fn(), onClone: vi.fn(), onShowTree: vi.fn(), onRefresh: vi.fn() }}
      />,
    );
    const item = screen.getByRole("button", { name });
    expect(item.getAttribute("title")).toBe(name);
    expect(item.querySelector("button")).toBeNull();
    fireEvent.click(item);
    expect(onSelect).toHaveBeenCalledWith("/tmp/session.jsonl", name);
  });

  it("点击行内操作不触发会话选择", () => {
    const onSelect = vi.fn();
    render(
      <SessionList
        sessions={[{ path: "/tmp/session.jsonl", name: "会话", cwd: "/tmp", messageCount: 3, firstMessage: "", modified: "" }]}
        currentSessionFile={null}
        openSessionFiles={new Set()}
        degraded={false}
        actions={{ onSelect, onNew: vi.fn(), onDelete: vi.fn(), onRename: vi.fn(), onClone: vi.fn(), onShowTree: vi.fn(), onRefresh: vi.fn() }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "重命名" }));
    expect(onSelect).not.toHaveBeenCalled();
  });
});
