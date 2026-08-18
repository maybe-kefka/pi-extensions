// @vitest-environment jsdom
// InputBar 组件测试（jsdom）：发送/abort 按钮融合 + 队列提示 + 上拉框触发
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { InputBar } from "./InputBar";

afterEach(cleanup);

// jsdom 无 scrollIntoView：MentionMenu 高亮滚动跟随需要
HTMLElement.prototype.scrollIntoView = vi.fn();

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
  it("消息输入框具有明确的可访问名称", () => {
    render(<InputBar {...base} />);
    expect(screen.getByRole("textbox", { name: "消息输入" })).toBeTruthy();
  });

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

  it("发送后草稿上报空（draft 不残留已发送内容）", () => {
    const onDraftChange = vi.fn();
    const onSend = vi.fn();
    render(<InputBar {...base} onDraftChange={onDraftChange} onSend={onSend} />);
    const editor = document.querySelector("[contenteditable]") as HTMLElement;
    editor.textContent = "要发送的内容";
    fireEvent.input(editor, { bubbles: true });
    const send = screen.getByRole("button", { name: "发送" });
    send.click();
    expect(onSend).toHaveBeenCalledWith("要发送的内容");
    // 发送后：编辑器清空且草稿上报空（重挂不会恢复已发送内容）
    expect(onDraftChange).toHaveBeenLastCalledWith("");
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

describe("R21 @ 触发与空态", () => {
  function fireKeys(el: HTMLElement, keys: string[]) {
    for (const k of keys) fireEvent.keyDown(el, { key: k, bubbles: true });
  }

  it("space → Shift → @ 触发文件面板；files 为空 → 提示当前目录无文件", () => {
    render(<InputBar {...base} files={[]} />);
    const el = screen.getByRole("textbox") as HTMLElement;
    fireKeys(el, [" ", "Shift", "@"]);
    expect(document.querySelector("[data-slot=mention-menu]")).toBeTruthy();
    expect(screen.getByText("当前目录无文件可引用")).toBeTruthy();
  });

  it("files 非空但过滤无匹配 → 提示无匹配文件", () => {
    render(
      <InputBar
        {...base}
        files={[{ dir: ".", files: [{ name: "a.ts", path: "src/a.ts", isDir: false }] }]}
      />,
    );
    const el = screen.getByRole("textbox") as HTMLElement;
    fireKeys(el, [" ", "Shift", "@", "x"]);
    expect(screen.getByText("无匹配文件")).toBeTruthy();
  });

  it("files 非空且匹配 → 显示文件候选", () => {
    render(
      <InputBar
        {...base}
        files={[{ dir: ".", files: [{ name: "a.ts", path: "src/a.ts", isDir: false }] }]}
      />,
    );
    const el = screen.getByRole("textbox") as HTMLElement;
    fireKeys(el, [" ", "Shift", "@"]);
    expect(screen.getByText("src/a.ts")).toBeTruthy();
  });
});
