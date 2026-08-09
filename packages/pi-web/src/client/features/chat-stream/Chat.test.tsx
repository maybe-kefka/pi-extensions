// Chat 组件渲染测试（jsdom）：R18 langgraph 流式模型 / 终态只留最终回复 / progress 单 scroll ReAct 流
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { Chat } from "./Chat";
import { initialState, streamReducer, type StreamAction } from "@/entities/chat/stream";

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

describe("Chat 气泡渲染（R18 langgraph 流式模型）", () => {
  it("history 回填：终态多 turn 只显示最后一个 turn 的文本", () => {
    const s = run([
      {
        type: "history",
        messages: [
          { role: "user", text: "问题一", userIndex: 0 },
          { role: "assistant", text: "中间过程文本", thinking: "想一" },
          { role: "assistant", text: "最终回复" },
        ],
      },
    ]);
    expect(s.bubbles).toHaveLength(1);
    const dispatch = vi.fn();
    render(<Chat state={s} dispatch={dispatch} onFork={vi.fn()} />);
    expect(screen.getByText("问题一")).toBeTruthy();
    // 只显示最终回复（最后一个 turn），中间 turn 文本隐藏
    expect(screen.getByText("最终回复")).toBeTruthy();
    expect(screen.queryByText("中间过程文本")).toBeNull();
    // thinking 不渲染
    expect(screen.queryByText("想一")).toBeNull();
  });

  it("user 消息气泡在右（data-align=end）", () => {
    const s = run([{ type: "message_start", message: { role: "user", content: "你好" } }]);
    const dispatch = vi.fn();
    const { container } = render(<Chat state={s} dispatch={dispatch} onFork={vi.fn()} />);
    const message = container.querySelector('[data-slot="message"]');
    expect(message?.getAttribute("data-align")).toBe("end");
  });

  it("流式中：reasoning 灰色小字实时全文 + content 流式 + 无工具栏", () => {
    const s = run([
      { type: "message_start", message: { role: "user", content: "q" } },
      {
        type: "message_start",
        message: {
          role: "assistant",
          content: [
            { type: "thinking", thinking: "" },
            { type: "text", text: "" },
          ],
        },
      },
      { type: "message_update", event: { type: "thinking_delta", contentIndex: 0, delta: "正在", partial: { thinking: "正在" } } },
      { type: "message_update", event: { type: "thinking_delta", contentIndex: 0, delta: "思考", partial: { thinking: "正在思考" } } },
      { type: "message_update", event: { type: "text_delta", contentIndex: 1, delta: "正" } },
      { type: "message_update", event: { type: "text_delta", contentIndex: 1, delta: "在" } },
    ]);
    const dispatch = vi.fn();
    render(<Chat state={s} dispatch={dispatch} onFork={vi.fn()} />);
    // reasoning 灰色小字实时全文（无 Thinking… 占位行）
    expect(screen.getByText("正在思考")).toBeTruthy();
    expect(screen.queryByText(/Thinking/)).toBeNull();
    // content 流式文本（精确匹配，避免命中 thinking 的"正在思考"）
    expect(screen.getByText("正在")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /fork/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /progress/ })).toBeNull();
  });

  it("流式中：ToolNode 卡片接在内容后（工具名 + 输出预览），点击就地展开 args", () => {
    const s = run([
      { type: "message_start", message: { role: "user", content: "q" } },
      {
        type: "message_start",
        message: {
          role: "assistant",
          content: [
            { type: "text", text: "我先读取" },
            { type: "toolCall", id: "t1", name: "bash", arguments: {} },
          ],
        },
      },
      { type: "tool_start", toolCallId: "t1", toolName: "bash", args: { command: "ls" } },
      { type: "tool_update", toolCallId: "t1", partialResult: { content: [{ type: "text", text: "out" }] } },
    ]);
    const dispatch = vi.fn();
    const { container } = render(<Chat state={s} dispatch={dispatch} onFork={vi.fn()} />);
    // content 在前、工具卡片在后（DOM 顺序）
    const slots = container.querySelectorAll("[data-slot]");
    const texts = [...slots].map((n) => n.getAttribute("data-slot"));
    expect(texts.indexOf("step-text")).toBeLessThan(texts.indexOf("step-tool"));
    // 工具卡片：工具名 + 输出预览可见
    expect(screen.getByText("bash")).toBeTruthy();
    expect(screen.getByText("out")).toBeTruthy();
    // 点击就地展开 args（无二级弹窗）
    fireEvent.click(screen.getByText("bash"));
    expect(screen.getByText(/"command"/)).toBeTruthy();
  });

  it("流式中：多轮循环轮边界清空——只显示当前活跃轮内容", () => {
    const s = run([
      { type: "message_start", message: { role: "user", content: "q" } },
      {
        type: "message_start",
        message: {
          role: "assistant",
          content: [
            { type: "text", text: "第一轮过程文本" },
            { type: "toolCall", id: "t1", name: "bash", arguments: {} },
          ],
        },
      },
      { type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "第一轮过程文本" }, { type: "toolCall", id: "t1", name: "bash", arguments: {} }] } },
      { type: "message_start", message: { role: "assistant", content: [{ type: "text", text: "" }] } },
      { type: "message_update", event: { type: "text_delta", contentIndex: 0, delta: "第二轮" } },
    ]);
    const dispatch = vi.fn();
    render(<Chat state={s} dispatch={dispatch} onFork={vi.fn()} />);
    // 第一轮内容已清空（轮边界），只显示第二轮
    expect(screen.getByText(/第二轮/)).toBeTruthy();
    expect(screen.queryByText("第一轮过程文本")).toBeNull();
    expect(screen.queryByText("bash")).toBeNull();
  });

  it("终态：thinking/工具/过程文本全消失，只留最终回复", () => {
    const s = run([
      { type: "message_start", message: { role: "user", content: "q" } },
      { type: "message_start", message: { role: "assistant", content: [] } },
      { type: "message_update", event: { type: "thinking_delta", delta: "思考全文", partial: { thinking: "思考全文" } } },
      { type: "tool_start", toolCallId: "t1", toolName: "bash", args: {} },
      { type: "tool_end", toolCallId: "t1", result: { content: [{ type: "text", text: "out" }] }, isError: false },
      {
        type: "message_end",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "过程文本" }, { type: "toolCall", id: "t1", name: "bash", arguments: {} }, { type: "text", text: "最终答案" }],
        },
      },
      { type: "agent_settled" },
    ]);
    const dispatch = vi.fn();
    render(<Chat state={s} dispatch={dispatch} onFork={vi.fn()} />);
    // 只显示最终 text 块（最后 text 块），过程 content / thinking / 工具全隐藏
    expect(screen.getByText("最终答案")).toBeTruthy();
    expect(screen.queryByText("过程文本")).toBeNull();
    expect(screen.queryByText("思考全文")).toBeNull();
    expect(screen.queryByText("bash")).toBeNull();
    expect(screen.queryByText("out")).toBeNull();
  });
});

describe("Chat 工具栏", () => {
  function doneBubble(): StreamAction[] {
    return [
      { type: "message_start", message: { role: "user", content: "q" } },
      {
        type: "message_start",
        message: {
          role: "assistant",
          content: [
            { type: "thinking", thinking: "思考过程全文" },
            { type: "text", text: "过程文本" },
            { type: "toolCall", id: "t1", name: "bash", arguments: {} },
          ],
        },
      },
      { type: "tool_start", toolCallId: "t1", toolName: "bash", args: { command: "ls" } },
      { type: "tool_end", toolCallId: "t1", result: { content: [{ type: "text", text: "out" }] }, isError: false },
      {
        type: "message_end",
        message: {
          role: "assistant",
          content: [
            { type: "thinking", thinking: "思考过程全文" },
            { type: "text", text: "过程文本" },
            { type: "toolCall", id: "t1", name: "bash", arguments: {} },
            { type: "text", text: "最终回复" },
          ],
        },
      },
      { type: "agent_settled" },
    ];
  }

  it("终态后：fork + progress 按钮，点击 fork 触发 onFork(userIndex)", () => {
    const s = run(doneBubble());
    const dispatch = vi.fn();
    const onFork = vi.fn();
    render(<Chat state={s} dispatch={dispatch} onFork={onFork} />);
    expect(screen.getByRole("button", { name: /fork/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /progress/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /fork/ }));
    expect(onFork).toHaveBeenCalledWith(0);
  });

  it("progress 弹窗：content 正常展示、reasoning 折叠（点击展开全文）、tool 折叠（点击展开 args/output）、不含最终回复", () => {
    const s = run(doneBubble());
    const dispatch = vi.fn();
    render(<Chat state={s} dispatch={dispatch} onFork={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /progress/ }));
    const scroll = document.querySelector("[data-slot=progress-scroll]");
    expect(scroll).toBeTruthy();
    // 过程 content 正常展示（不折叠）
    expect(within(scroll as HTMLElement).getByText("过程文本")).toBeTruthy();
    // 最终回复不在弹窗（在气泡正文里）
    expect(within(scroll as HTMLElement).queryByText("最终回复")).toBeNull();
    // reasoning 默认折叠：显示 "reasoning" 标签，全文不可见；点击展开
    expect(within(scroll as HTMLElement).getByText(/reasoning/)).toBeTruthy();
    expect(within(scroll as HTMLElement).queryByText("思考过程全文")).toBeNull();
    fireEvent.click(within(scroll as HTMLElement).getByText(/reasoning/));
    expect(within(scroll as HTMLElement).getByText("思考过程全文")).toBeTruthy();
    // tool 默认折叠：摘要行（工具名可见），args 不可见；点击展开 args/output
    expect(within(scroll as HTMLElement).getByText("bash")).toBeTruthy();
    expect(within(scroll as HTMLElement).queryByText(/"command"/)).toBeNull();
    fireEvent.click(within(scroll as HTMLElement).getByText("bash"));
    expect(within(scroll as HTMLElement).getByText(/"command"/)).toBeTruthy();
    expect(within(scroll as HTMLElement).getAllByText("out").length).toBeGreaterThanOrEqual(1);
  });

  it("agent 忙碌（下一轮进行中）→ 不显示工具栏", () => {
    const s = run([...doneBubble(), { type: "agent_start" }]);
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
