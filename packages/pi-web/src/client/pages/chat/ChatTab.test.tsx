// @vitest-environment jsdom
// ChatTab 状态快照恢复测试：savedState 注入初始化 reducer（split 跨父重挂后消息不丢）、卸载时 onStateSave 上报快照
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { ChatTab, type ChatTabProps } from "./ChatTab";
import { initialState, streamReducer, type StreamAction, type StreamState } from "@/entities/chat";

afterEach(cleanup);

beforeEach(() => {
  if (!(globalThis as unknown as Record<string, unknown>).ResizeObserver) {
    (globalThis as unknown as Record<string, unknown>).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  (globalThis as unknown as Record<string, unknown>).requestAnimationFrame ??= (cb: () => void) => setTimeout(cb, 0);
});

function base(partial: Partial<ChatTabProps> = {}): ChatTabProps {
  return {
    sessionId: "/s.jsonl",
    name: "会话",
    processId: "p1",
    dead: false,
    usage: null,
    onRevive: vi.fn(),
    active: true,
    request: (() => Promise.reject(new Error("no rpc"))) as unknown as ChatTabProps["request"],
    conn: "open",
    skills: [],
    commands: [],
    files: [],
    pickerLoading: false,
    onPickerOpen: vi.fn(),
    onFork: vi.fn(),
    onRegisterDispatch: vi.fn(),
    onUnregisterDispatch: vi.fn(),
    onStateChange: vi.fn(),
    ...partial,
  };
}

function stateWithHistory(): StreamState {
  const s = streamReducer(
    initialState,
    {
      type: "history",
      messages: [
        { role: "user", text: "快照中的问题", userIndex: 0 },
        { role: "assistant", text: "快照中的回复" },
      ],
    } as unknown as StreamAction,
  );
  return s;
}

describe("ChatTab 状态快照", () => {
  it("savedState 注入：重挂后消息内容直接显示（不重拉历史）", () => {
    const saved = stateWithHistory();
    render(<ChatTab {...base({ savedState: saved })} />);
    expect(document.body.textContent).toContain("快照中的问题");
    expect(document.body.textContent).toContain("快照中的回复");
  });

  it("卸载时上报最新状态快照（onStateSave 收到 reducer 状态）", () => {
    const onStateSave = vi.fn();
    const { unmount } = render(<ChatTab {...base({ onStateSave })} />);
    unmount();
    expect(onStateSave).toHaveBeenCalledTimes(1);
    const [sid, state] = onStateSave.mock.calls[0] as [string, StreamState];
    expect(sid).toBe("/s.jsonl");
    expect(state).toBeDefined();
    expect(Array.isArray(state.bubbles)).toBe(true);
  });
});
