// @vitest-environment jsdom
// Chat 组件渲染测试（jsdom）：R18 langgraph 流式模型 / 终态只留最终回复 / progress 单 scroll ReAct 流
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { Chat } from "./Chat";
import { initialState, streamReducer, type StreamAction, type StreamState } from "@/entities/chat/stream";

function reduce(actions: StreamAction[]): StreamState {
  return actions.reduce((st, a) => streamReducer(st, a), initialState);
}

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
    // R20：活跃气泡 progress 可见（实时看流程）、fork 不可见
    expect(screen.queryByRole("button", { name: /fork/ })).toBeNull();
    expect(screen.getByRole("button", { name: /progress/ })).toBeTruthy();
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

  it("R20：轮边界不清空——新轮有内容才原子切换（过渡期显示上一轮）", () => {
    const first = run([
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
      {
        type: "message_end",
        message: { role: "assistant", content: [{ type: "text", text: "第一轮过程文本" }, { type: "toolCall", id: "t1", name: "bash", arguments: {} }] },
      },
      { type: "tool_start", toolCallId: "t1", toolName: "bash", args: { command: "ls" } },
      { type: "tool_end", toolCallId: "t1", result: { content: [{ type: "text", text: "out" }] }, isError: false },
      { type: "turn_end" },
      // 第二轮刚开始（steps 空）——过渡期
      { type: "message_start", message: { role: "assistant", content: [] } },
    ]);
    const dispatch = vi.fn();
    const { rerender } = render(<Chat state={first} dispatch={dispatch} onFork={vi.fn()} />);
    // 新轮无内容 → 上一轮内容保留（工具卡片可见，无空白帧）
    expect(screen.getByText("bash")).toBeTruthy();
    expect(screen.getByText("out")).toBeTruthy();
    // text_delta 到达 → 原子切换为新轮内容
    const second = run([
      ...(() => {
        const a: StreamAction[] = [
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
          {
            type: "message_end",
            message: { role: "assistant", content: [{ type: "text", text: "第一轮过程文本" }, { type: "toolCall", id: "t1", name: "bash", arguments: {} }] },
          },
          { type: "tool_start", toolCallId: "t1", toolName: "bash", args: { command: "ls" } },
          { type: "tool_end", toolCallId: "t1", result: { content: [{ type: "text", text: "out" }] }, isError: false },
          { type: "turn_end" },
          { type: "message_start", message: { role: "assistant", content: [] } },
        ];
        return a;
      })(),
      { type: "message_update", event: { type: "text_delta", contentIndex: 0, delta: "第二轮" } },
    ]);
    rerender(<Chat state={second} dispatch={dispatch} onFork={vi.fn()} />);
    // 已切换：显示第二轮，旧轮内容隐藏
    expect(screen.getByText(/第二轮/)).toBeTruthy();
    expect(screen.queryByText("第一轮过程文本")).toBeNull();
    expect(screen.queryByText("bash")).toBeNull();
  });

  it("R20：终态工具轮（无最终文本）显示工具卡片 done 态", () => {
    const s = run([
      { type: "message_start", message: { role: "user", content: "q" } },
      { type: "message_start", message: { role: "assistant", content: [] } },
      { type: "message_update", event: { type: "toolcall_start", contentIndex: 0 } },
      { type: "message_end", message: { role: "assistant", content: [{ type: "toolCall", id: "t1", name: "bash", arguments: { command: "ls" } }] } },
      { type: "tool_start", toolCallId: "t1", toolName: "bash", args: { command: "ls" } },
      { type: "tool_end", toolCallId: "t1", result: { content: [{ type: "text", text: "out" }] }, isError: false },
      { type: "turn_end" },
      { type: "agent_settled" },
    ]);
    const dispatch = vi.fn();
    render(<Chat state={s} dispatch={dispatch} onFork={vi.fn()} />);
    // 终态：无最终文本 → 保留工具卡片（done 态）而非白屏
    expect(screen.getByText("bash")).toBeTruthy();
    expect(screen.getByText("out")).toBeTruthy();
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

  it("R20：已完成气泡在 agent 忙碌时按钮保留（per-bubble 独立）", () => {
    const s = run([...doneBubble(), { type: "agent_start" }]);
    const dispatch = vi.fn();
    render(<Chat state={s} dispatch={dispatch} onFork={vi.fn()} />);
    // 气泡已完成（自身不在流式）→ 即使 agent 全局忙碌也显示按钮
    expect(screen.getByRole("button", { name: /fork/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /progress/ })).toBeTruthy();
  });

  it("R20：两个气泡——已完成气泡按钮常驻，活跃气泡只显示 progress（fork 仅完成态）", () => {
    // 气泡 A 已完成
    const a = run(doneBubble());
    // 气泡 B 流式中（活跃）
    const s = run([
      ...doneBubble(),
      { type: "message_start", message: { role: "user", content: "第二个任务" } },
      { type: "message_start", message: { role: "assistant", content: [{ type: "text", text: "" }] } },
      { type: "message_update", event: { type: "text_delta", contentIndex: 0, delta: "B 流式" } },
    ]);
    expect(s.bubbles).toHaveLength(2);
    const dispatch = vi.fn();
    render(<Chat state={s} dispatch={dispatch} onFork={vi.fn()} />);
    // 已完成气泡 A：fork + progress 均可见
    expect(screen.getAllByRole("button", { name: /fork/ })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: /progress/ })).toHaveLength(2);
    // 活跃气泡 B：progress 可见（实时看流程），fork 不可见
    expect(screen.getByText("B 流式")).toBeTruthy();
  });

  it("R20：活跃气泡（无已完成气泡）→ progress 可见、fork 不可见", () => {
    const s = run([
      { type: "message_start", message: { role: "user", content: "q" } },
      { type: "message_start", message: { role: "assistant", content: [{ type: "text", text: "" }] } },
      { type: "message_update", event: { type: "text_delta", contentIndex: 0, delta: "流式" } },
    ]);
    const dispatch = vi.fn();
    render(<Chat state={s} dispatch={dispatch} onFork={vi.fn()} />);
    expect(screen.getByRole("button", { name: /progress/ })).toBeTruthy();
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

describe("R20 compact 展示", () => {
  function compactBannerState(phase: "before" | "done", reason: string | null = "manual", willRetry = false): StreamState {
    return run([
      { type: "message_start", message: { role: "user", content: "q" } },
      { type: "message_start", message: { role: "assistant", content: [{ type: "text", text: "答" }] } },
      { type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "答" }] } },
      ...(phase === "before"
        ? [{ type: "session_before_compact" as const, reason, willRetry }]
        : [
            { type: "session_before_compact" as const, reason, willRetry },
            { type: "session_compact" as const, reason, willRetry, fromExtension: false },
          ]),
    ]);
  }

  it("before：聊天流显示压缩中记录（转圈 + 原因，无顶部横幅）", () => {
    const dispatch = vi.fn();
    render(<Chat state={compactBannerState("before", "threshold", true)} dispatch={dispatch} onFork={vi.fn()} />);
    expect(document.querySelector("[data-slot=compact-banner]")).toBeNull();
    const record = document.querySelector("[data-slot=compact-record]");
    expect(record).toBeTruthy();
    expect(record?.textContent).toContain("正在压缩上下文");
    expect(record?.textContent).toContain("阈值");
    expect(record?.querySelector("[data-slot=compact-spinner]")).toBeTruthy();
  });

  it("done：记录气泡完成态（willRetry 提示）", () => {
    const dispatch = vi.fn();
    render(<Chat state={compactBannerState("done", "manual", true)} dispatch={dispatch} onFork={vi.fn()} />);
    expect(document.querySelector("[data-slot=compact-banner]")).toBeNull();
    const record = document.querySelector("[data-slot=compact-record]");
    expect(record).toBeTruthy();
    expect(record?.textContent).toContain("上下文已压缩");
    expect(record?.textContent).toContain("将重试上一条消息");
    expect(record?.querySelector("[data-slot=compact-spinner]")).toBeNull();
  });

  it("无 compact 状态：无记录气泡", () => {
    const dispatch = vi.fn();
    render(<Chat state={run([{ type: "message_start", message: { role: "user", content: "q" } }])} dispatch={dispatch} onFork={vi.fn()} />);
    expect(document.querySelector("[data-slot=compact-banner]")).toBeNull();
    expect(document.querySelector("[data-slot=compact-record]")).toBeNull();
  });
});

describe("R22 turn_start 气泡时机", () => {
  it("turn_start 后 assistant 气泡出现（空 turn + ▍）", () => {
    const dispatch = vi.fn();
    const state = reduce([
      { type: "message_start", message: { role: "user", content: "q" } },
      { type: "turn_start" },
    ]);
    render(<Chat state={state} dispatch={dispatch} onFork={vi.fn()} />);
    const caret = document.querySelector("[data-slot=working-caret]");
    expect(caret).toBeTruthy();
    expect(document.querySelector("[data-slot=streaming-steps]")).toBeTruthy();
  });
});

describe("R23 F1 流式纯文本渲染", () => {
  it("流式中（active）text 块为纯文本：无 markdown-body，含 ▍ 光标", () => {
    const s = run([
      { type: "message_start", message: { role: "user", content: "q" } },
      {
        type: "message_start",
        message: { role: "assistant", content: [{ type: "text", text: "" }] },
      },
      { type: "message_update", event: { type: "text_delta", contentIndex: 0, delta: "**加粗**" } },
      { type: "message_update", event: { type: "text_delta", contentIndex: 0, delta: " 内容" } },
    ]);
    const dispatch = vi.fn();
    const { container } = render(<Chat state={s} dispatch={dispatch} onFork={vi.fn()} />);
    const stepText = container.querySelector("[data-slot=step-text]");
    expect(stepText).toBeTruthy();
    // 纯文本：无 markdown 结构，原文可见（含未解析的 ** 标记）
    expect(stepText?.querySelector(".markdown-body")).toBeNull();
    expect(stepText?.textContent).toContain("**加粗** 内容");
    // ▍ 光标在最后 text 块
    expect(stepText?.textContent).toContain("▍");
  });

  it("过渡轮（active=false 显示上一轮）text 块仍为 Markdown", () => {
    const s = run([
      { type: "message_start", message: { role: "user", content: "q" } },
      { type: "message_start", message: { role: "assistant", content: [{ type: "text", text: "第一轮 **格式**" }] } },
      { type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "第一轮 **格式**" }] } },
      { type: "turn_end" },
      // 新轮：turn_start 空 turn，内容未到 → 过渡期显示上一轮（active=false）
      { type: "turn_start" },
    ]);
    const dispatch = vi.fn();
    const { container } = render(<Chat state={s} dispatch={dispatch} onFork={vi.fn()} />);
    const stepText = container.querySelector("[data-slot=step-text]");
    expect(stepText).toBeTruthy();
    // Markdown 渲染（markdown-body 存在），且解析了 **格式**（strong 元素）
    expect(stepText?.querySelector(".markdown-body")).toBeTruthy();
    expect(stepText?.querySelector("strong")).toBeTruthy();
    // 过渡轮非活跃：无 ▍ 光标
    expect(stepText?.textContent).not.toContain("▍");
  });
});

describe("R23 F3 ToolCard 惰性序列化", () => {
  it("大 args 折叠态不渲染完整 JSON（preview 截断），展开后完整", () => {
    const bigArgs = { data: "x".repeat(5000) };
    const s = run([
      { type: "message_start", message: { role: "user", content: "q" } },
      {
        type: "message_start",
        message: {
          role: "assistant",
          content: [{ type: "toolCall", id: "t1", name: "bash", arguments: bigArgs }],
        },
      },
      { type: "tool_start", toolCallId: "t1", toolName: "bash", args: bigArgs },
    ]);
    const dispatch = vi.fn();
    const { container } = render(<Chat state={s} dispatch={dispatch} onFork={vi.fn()} />);
    // 折叠态：卡片按钮内不出现完整 JSON 体（preview 有截断，无展开区）
    const btn = container.querySelector("[data-slot=tool-toggle]");
    expect(btn?.textContent).not.toContain("xxxxx".repeat(1000));
    expect(container.querySelectorAll("pre")).toHaveLength(0);
    // 展开后：完整 JSON（含缩进）出现
    fireEvent.click(btn!);
    const pres = container.querySelectorAll("pre");
    expect(pres.length).toBeGreaterThan(0);
    expect([...pres].some((p) => p.textContent?.includes("\"data\""))).toBeTruthy();
  });
});

describe("R24 UI 细节", () => {
  it("头像上对齐（message-avatar self-start）", () => {
    const s = run([
      { type: "message_start", message: { role: "user", content: "q" } },
      { type: "message_start", message: { role: "assistant", content: [{ type: "text", text: "回复" }] } },
    ]);
    const { container } = render(<Chat state={s} dispatch={vi.fn()} onFork={vi.fn()} />);
    const avatars = container.querySelectorAll("[data-slot=message-avatar]");
    expect(avatars.length).toBeGreaterThan(0);
    for (const a of avatars) {
      expect(a.className).toContain("self-start");
      expect(a.className).not.toContain("self-end");
    }
  });

  it("聊天流底部空间 25vh（pb-[25vh]）", () => {
    const s = run([{ type: "message_start", message: { role: "user", content: "q" } }]);
    const { container } = render(<Chat state={s} dispatch={vi.fn()} onFork={vi.fn()} />);
    const content = container.querySelector("[data-slot=message-scroller-content]");
    expect(content?.className).toContain("pb-[25vh]");
  });
});

describe("R24 think 窗口", () => {
  it("thinking 块限 4 行滚动（max-h-16 overflow-y-auto）", () => {
    const s = run([
      { type: "message_start", message: { role: "user", content: "q" } },
      { type: "message_start", message: { role: "assistant", content: [{ type: "thinking", thinking: "" }] } },
      { type: "message_update", event: { type: "thinking_delta", contentIndex: 0, delta: "x".repeat(200), partial: { thinking: "x".repeat(200) } } },
    ]);
    const { container } = render(<Chat state={s} dispatch={vi.fn()} onFork={vi.fn()} />);
    const th = container.querySelector("[data-slot=step-thinking]");
    expect(th).toBeTruthy();
    expect(th?.className).toContain("max-h-16");
    expect(th?.className).toContain("overflow-y-auto");
  });
});
