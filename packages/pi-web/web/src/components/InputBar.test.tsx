// InputBar 组件测试（jsdom）：发送/abort 按钮融合 + 队列提示 + 上拉框触发
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { InputBar } from "./InputBar";

afterEach(cleanup);

const base = {
  busy: false,
  queue: { steering: [], followUp: [] },
  conn: "open" as const,
  skills: [],
  commands: [],
  files: [],
  pickerLoading: false,
  onSend: vi.fn(),
  onAbort: vi.fn(),
  onPickerOpen: vi.fn(),
};

describe("InputBar 发送/abort 融合", () => {
  it("空闲：显示发送按钮（↑），不显示 abort", () => {
    render(<InputBar {...base} />);
    expect(screen.getByRole("button", { name: "发送" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "停止生成" })).toBeNull();
  });

  it("LLM 运行中：显示 abort 按钮（■），点击触发 onAbort", () => {
    const onAbort = vi.fn();
    render(<InputBar {...base} busy={true} onAbort={onAbort} />);
    const abort = screen.getByRole("button", { name: "停止生成" });
    expect(abort).toBeTruthy();
    expect(screen.queryByRole("button", { name: "发送" })).toBeNull();
    abort.click();
    expect(onAbort).toHaveBeenCalled();
  });

  it("无输入：发送按钮禁用", () => {
    render(<InputBar {...base} />);
    expect(screen.getByRole("button", { name: "发送" }).hasAttribute("disabled")).toBe(true);
  });

  it("队列 > 0：显示已排队提示条", () => {
    render(<InputBar {...base} queue={{ steering: [], followUp: ["a", "b"] }} />);
    expect(screen.getByText(/已排队 2 条/)).toBeTruthy();
  });

  it("无队列：不显示提示条", () => {
    render(<InputBar {...base} />);
    expect(screen.queryByText(/已排队/)).toBeNull();
  });
});
