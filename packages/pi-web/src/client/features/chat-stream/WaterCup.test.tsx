// @vitest-environment jsdom
// 水杯进度条：水位高度 + 分级变色
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { WaterCup } from "./WaterCup.js";

describe("WaterCup（垂直水杯进度条）", () => {
  afterEach(cleanup);

  it("低水位 → ok 色（绿）", () => {
    render(<WaterCup percent={0.1} />);
    const water = document.querySelector("[data-water]") as HTMLElement;
    expect(water.className).toContain("emerald");
  });

  it("高水位 → danger 色（红）", () => {
    render(<WaterCup percent={0.95} />);
    const water = document.querySelector("[data-water]") as HTMLElement;
    expect(water.className).toContain("red");
  });

  it("水位高度 = percent 百分比", () => {
    render(<WaterCup percent={0.5} />);
    const water = document.querySelector("[data-water]") as HTMLElement;
    expect(water.style.height).toBe("50%");
  });
});

  it("与 input 同高调宽：h-10 + w-3.5（同块布局）", () => {
    render(<WaterCup percent={0.3} />);
    const cup = screen.getByRole("progressbar");
    expect(cup.className).toContain("h-10");
    expect(cup.className).toContain("w-3.5");
  });
