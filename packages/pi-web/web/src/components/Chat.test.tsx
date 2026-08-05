// Chat 组件渲染测试（jsdom）：气泡聚合 / 工具栏显隐 / 详情弹窗 / fork 回调
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Chat } from "./Chat";
import { initialState, streamReducer, type StreamAction } from "../lib/stream";

afterEach(cleanup);

// jsdom 无这些 API，message-scroller 需要
beforeEach(() => {
  if (!(globalThis as unknown as Record<string, unknown>).ResizeObserver) {
    (globalThis as unknown as Record<string, unknown>).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  if (!(globalThis as unknown as Record<string, unknown>).IntersectionObserver) {
    (globalThis as unknown as Record<string, unknown>).IntersectionObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    };
  }
  (globalThis as unknown as Record<string, unknown>).requestAnimationFrame ??= (cb: () => void) => setTimeout(cb, 0);
});

function run(actions: StreamAction[]) {
  return actions.reduce(streamReducer, initialState);
}

describe("Chat 气泡渲染", () => {
  it("history 回填：user 消息 + 聚合 turns 渲染", () => {
    const s = run([
      {
        type: "history",
        messages: [
          { role: "user", text: "问题一", userIndex: 0 },
          { role: "assistant", text: "回答一", thinking: "想一" },
          { role: "assistant", text: "补充" },
        ],
      },
    ]);
    expect(s.bubbles).toHaveLength(1);
    const dispatch = vi.fn();
    render(<Chat state={s} dispatch={dispatch} onFork={vi.fn()} />);
    expect(screen.getByText("问题一")).toBeTruthy();
    expect(screen.getByText("回答一")).toBeTruthy();
    expect(screen.getByText("补充")).toBeTruthy();
  });

  it("user 消息气泡在右（data-align=end）", () => {
    const s = run([{ type: "message_start", message: { role: "user", content: "你好" } }]);
    const dispatch = vi.fn();
    const { container } = render(<Chat state={s} dispatch={dispatch} onFork={vi.fn()} />);
    const message = container.querySelector('[data-slot="message"]');
    expect(message?.getAttribute("data-align")).toBe("end");
  });

  it("流式中：assistant 文本实时渲染、光标闪烁、无工具栏", () => {
    let s = run([
      { type: "message_start", message: { role: "user", content: "q" } },
      { type: "message_start", message: { role: "assistant", content: [] } },
      { type: "message_update", event: { type: "text_delta", delta: "正" } },
      { type: "message_update", event: { type: "text_delta", delta: "在" } },
    ]);
    const dispatch = vi.fn();
    render(<Chat state={s} dispatch={dispatch} onFork={vi.fn()} />);
    expect(screen.getByText(/正在/)).toBeTruthy();
    // turn 未 final + agent 忙碌 → 无工具栏
    expect(screen.queryByRole("button", { name: /fork/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /reasoning/ })).toBeNull();
  });
});

describe("Chat 工具栏", () => {
  function doneBubble(thinking: string, withTools: boolean): StreamAction[] {
    const actions: StreamAction[] = [
      { type: "message_start", message: { role: "user", content: "q" } },
      { type: "message_start", message: { role: "assistant", content: [] } },
      { type: "message_update", event: { type: "thinking_delta", delta: thinking, partial: { thinking } } },
    ];
    if (withTools) {
      actions.push(
        { type: "tool_start", toolCallId: "t1", toolName: "bash", args: { command: "ls" } },
        { type: "tool_end", toolCallId: "t1", result: { content: [{ type: "text", text: "out" }] }, isError: false },
        {
          type: "message_end",
          message: {
            role: "assistant",
            content: [{ type: "toolCall", id: "t1", name: "bash", arguments: {} }, { type: "text", text: "答" }],
          },
        },
      );
    } else {
      actions.push({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "答" }] } });
    }
    actions.push({ type: "agent_settled" });
    return actions;
  }

  it("轮结束后：fork + reasoning + tools 按钮显示，点击 fork 触发 onFork(userIndex)", () => {
    const s = run(doneBubble("思考过程", true));
    const dispatch = vi.fn();
    const onFork = vi.fn();
    render(<Chat state={s} dispatch={dispatch} onFork={onFork} />);
    expect(screen.getByRole("button", { name: /fork/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /reasoning/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /tools/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /fork/ }));
    expect(onFork).toHaveBeenCalledWith(0);
  });

  it("无 thinking 时不显示 reasoning 按钮；无工具时不显示 tools 按钮", () => {
    const s = run(doneBubble("", false));
    const dispatch = vi.fn();
    render(<Chat state={s} dispatch={dispatch} onFork={vi.fn()} />);
    expect(screen.getByRole("button", { name: /fork/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /reasoning/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /tools/ })).toBeNull();
  });

  it("reasoning 弹窗：点击显示完整思考内容", () => {
    const s = run(doneBubble("思考过程全文", false));
    const dispatch = vi.fn();
    render(<Chat state={s} dispatch={dispatch} onFork={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /reasoning/ }));
    expect(screen.getByText("思考过程全文")).toBeTruthy();
  });

  it("tools 弹窗：点击显示工具卡片与输出", () => {
    const s = run(doneBubble("x", true));
    const dispatch = vi.fn();
    render(<Chat state={s} dispatch={dispatch} onFork={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /tools/ }));
    expect(screen.getByText(/工具调用/)).toBeTruthy();
    expect(screen.getByText("bash")).toBeTruthy();
    expect(screen.getByText("out")).toBeTruthy();
  });

  it("agent 忙碌（下一轮进行中）→ 不显示工具栏", () => {
    const s = run([...doneBubble("x", false), { type: "agent_start" }]);
    const dispatch = vi.fn();
    render(<Chat state={s} dispatch={dispatch} onFork={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /fork/ })).toBeNull();
  });

  it("孤儿气泡（无 user 消息）→ 不显示工具栏（无 fork 目标）", () => {
    const s = run([
      { type: "message_start", message: { role: "assistant", content: [] } },
      { type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "孤儿" }] } },
      { type: "agent_settled" },
    ]);
    expect(s.bubbles[0].userIndex).toBe(-1);
    const dispatch = vi.fn();
    render(<Chat state={s} dispatch={dispatch} onFork={vi.fn()} />);
    expect(screen.getByText("孤儿")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /fork/ })).toBeNull();
  });
});

describe("Chat 空状态", () => {
  it("无消息 → 空状态提示", () => {
    const dispatch = vi.fn();
    render(<Chat state={initialState} dispatch={dispatch} onFork={vi.fn()} />);
    expect(screen.getByText("暂无消息")).toBeTruthy();
  });
});
