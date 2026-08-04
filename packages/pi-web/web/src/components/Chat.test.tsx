// Chat 组件渲染测试（jsdom）：thinking 折叠 / avatar 对齐 / 连续消息组
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

describe("Chat 渲染", () => {
  it("thinking 非空 → 渲染'思考'折叠按钮，点击展开显示内容", () => {
    let s = run([
      { type: "message_start", message: { role: "assistant", content: [] } },
      { type: "message_update", event: { type: "thinking_delta", delta: "正在思考中" } },
      { type: "message_update", event: { type: "text_delta", delta: "回答" } },
      { type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "回答" }] } },
    ]);
    expect(s.messages[0].thinking).toBe("正在思考中");
    const dispatch = vi.fn();
    const { container } = render(<Chat state={s} dispatch={dispatch} />);
    const btn = screen.getByRole("button", { name: /思考/ });
    expect(btn).toBeTruthy();
    // 未展开 → 内容不可见
    expect(screen.queryByText("正在思考中")).toBeNull();
    fireEvent.click(btn);
    expect(dispatch).toHaveBeenCalledWith({ type: "toggle_thinking", id: s.messages[0].id });
  });

  it("thinking 为空 → 不渲染折叠按钮", () => {
    const s = run([{ type: "message_start", message: { role: "assistant", content: [] } }]);
    const dispatch = vi.fn();
    render(<Chat state={s} dispatch={dispatch} />);
    expect(screen.queryByRole("button", { name: /思考/ })).toBeNull();
  });

  it("user 消息：气泡在右、头像在右（DOM 中 Avatar 在 Content 之前，flex-row-reverse 排到右侧）", () => {
    const s = run([{ type: "message_start", message: { role: "user", content: "你好" } }]);
    const dispatch = vi.fn();
    const { container } = render(<Chat state={s} dispatch={dispatch} />);
    const message = container.querySelector('[data-slot="message"]');
    expect(message?.getAttribute("data-align")).toBe("end");
    const slots = Array.from(message?.querySelectorAll("[data-slot]") ?? []).map((el) => el.getAttribute("data-slot"));
    const contentIdx = slots.indexOf("message-content");
    const avatarIdx = slots.indexOf("message-avatar");
    expect(contentIdx).toBeGreaterThanOrEqual(0);
    expect(avatarIdx).toBeGreaterThanOrEqual(0);
    // 修复：Avatar 在 Content 之前，配合 row-reverse 视觉上头像在最右
    expect(avatarIdx).toBeLessThan(contentIdx);
  });

  it("连续同角色消息合并为 MessageGroup", () => {
    let s = run([
      { type: "message_start", message: { role: "assistant", content: [] } },
      { type: "message_update", event: { type: "text_delta", delta: "第一段" } },
      { type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "第一段" }] } },
      { type: "message_start", message: { role: "assistant", content: [] } },
      { type: "message_update", event: { type: "text_delta", delta: "第二段" } },
      { type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "第二段" }] } },
    ]);
    const dispatch = vi.fn();
    const { container } = render(<Chat state={s} dispatch={dispatch} />);
    expect(screen.getByText("第一段")).toBeTruthy();
    expect(screen.getByText("第二段")).toBeTruthy();
    // 两条连续 assistant 消息在同一 message-group 内
    const group = container.querySelector('[data-slot="message-group"]');
    expect(group).toBeTruthy();
    expect(group?.querySelectorAll('[data-slot="message"]').length).toBe(2);
  });

  it("history 加载带 thinking → 显示思考按钮", () => {
    const s = run([
      {
        type: "history",
        messages: [
          { role: "assistant", text: "回答", thinking: "历史思考内容" },
        ],
      },
    ]);
    const dispatch = vi.fn();
    render(<Chat state={s} dispatch={dispatch} />);
    expect(s.messages[0].thinking).toBe("历史思考内容");
    expect(screen.getByRole("button", { name: /思考/ })).toBeTruthy();
  });

  it("纯工具消息（无 text 无 thinking）→ 不渲染空气泡，工具卡片穿插在消息内", () => {
    let s = run([
      { type: "message_start", message: { role: "assistant", content: [] } },
      { type: "message_end", message: { role: "assistant", content: [{ type: "toolCall", id: "tool:1", name: "bash", arguments: {} }] } },
      { type: "tool_start", toolCallId: "tool:1", toolName: "bash", args: { command: "ls" } },
      { type: "tool_end", toolCallId: "tool:1", result: { content: "file1" }, isError: false },
    ]);
    const dispatch = vi.fn();
    const { container } = render(<Chat state={s} dispatch={dispatch} />);
    // 无 assistant 气泡（air bubble 隐藏）
    expect(screen.queryByText(/助手/)).toBeNull();
    // 工具卡片按钮存在（点击弹详情）
    const toolBtn = screen.getByRole("button", { name: /bash/ });
    expect(toolBtn).toBeTruthy();
    // 卡片位于消息组内（穿插）
    const group = container.querySelector('[data-slot="message-group"]');
    expect(group?.textContent).toContain("bash");
    // 点击 → Dialog 详情
    fireEvent.click(toolBtn);
    expect(screen.getByText("输出")).toBeTruthy();
    // 预览与弹窗内都有输出文本
    expect(screen.getAllByText("file1").length).toBeGreaterThanOrEqual(1);
  });

  it("streaming 且无 text → 仍渲染气泡（不闪烁）", () => {
    const s = run([{ type: "message_start", message: { role: "assistant", content: [] } }]);
    expect(s.messages[0].streaming).toBe(true);
    const dispatch = vi.fn();
    render(<Chat state={s} dispatch={dispatch} />);
    expect(screen.getByText(/助手/)).toBeTruthy();
  });
});
