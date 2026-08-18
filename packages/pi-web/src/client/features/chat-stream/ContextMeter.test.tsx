// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ContextMeter } from "./ContextMeter.js";

describe("ContextMeter", () => {
  afterEach(cleanup);

  it("exposes named bounded progress and a readable percentage", () => {
    render(<ContextMeter percent={0.42} />);
    const meter = screen.getByRole("progressbar", { name: "上下文" });
    expect(screen.getByText("上下文")).toBeTruthy();
    expect(screen.getByText("42%")).toBeTruthy();
    expect(meter.getAttribute("aria-valuenow")).toBe("42");
    expect(meter.getAttribute("aria-valuemin")).toBe("0");
    expect(meter.getAttribute("aria-valuemax")).toBe("100");
    expect(meter.getAttribute("aria-valuetext")).toBe("42% 已使用");
  });

  it("没有 usage 时显示占位并省略当前值", () => {
    render(<ContextMeter percent={null} />);
    const meter = screen.getByRole("progressbar", { name: "上下文" });
    expect(screen.getByText("—")).toBeTruthy();
    expect(meter.getAttribute("aria-valuenow")).toBeNull();
    expect(meter.getAttribute("aria-valuetext")).toBe("暂无上下文数据");
  });

  it("非法 usage 同样保持明确的空值语义", () => {
    render(<ContextMeter percent={Number.NaN} />);
    const meter = screen.getByRole("progressbar", { name: "上下文" });
    expect(screen.getByText("—")).toBeTruthy();
    expect(meter.getAttribute("aria-valuenow")).toBeNull();
    expect(meter.getAttribute("aria-valuetext")).toBe("暂无上下文数据");
  });

  it("超出范围的 usage 对外暴露为 bounded value", () => {
    render(<ContextMeter percent={150} />);
    const meter = screen.getByRole("progressbar", { name: "上下文" });
    expect(meter.getAttribute("aria-valuenow")).toBe("100");
    expect(meter.getAttribute("aria-valuetext")).toBe("100% 已使用");
    expect(meter.getAttribute("data-tier")).toBe("danger");
  });
});
