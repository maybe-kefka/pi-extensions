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
});
