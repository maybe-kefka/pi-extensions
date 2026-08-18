// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ChatEmptyGuide } from "./ChatEmptyGuide.js";

describe("ChatEmptyGuide（无注册会话空态）", () => {
  afterEach(cleanup);

  it("提示在 pi 里运行 /web 注册会话", () => {
    render(<ChatEmptyGuide />);
    expect(screen.getByText(/\/web/)).toBeTruthy();
    expect(screen.getByText(/注册/)).toBeTruthy();
  });

  it("提供 command-center 空态层级与现有入口", () => {
    render(<ChatEmptyGuide />);
    expect(screen.getByText("工作区已就绪")).toBeTruthy();
    expect(screen.getByText(/侧边栏打开文件/)).toBeTruthy();
  });
});
