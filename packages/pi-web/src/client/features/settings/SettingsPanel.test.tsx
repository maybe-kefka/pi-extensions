// @vitest-environment jsdom
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsPanel } from "./SettingsPanel";

HTMLElement.prototype.hasPointerCapture ??= vi.fn(() => false);
HTMLElement.prototype.setPointerCapture ??= vi.fn();
HTMLElement.prototype.releasePointerCapture ??= vi.fn();
HTMLElement.prototype.scrollIntoView ??= vi.fn();

const props = {
  models: [{ provider: "openai", id: "gpt", name: "A very long model name" }],
  currentModel: "openai/gpt",
  thinkingLevel: "medium",
  thinkingLevels: ["low", "medium", "high"],
  onSetModel: vi.fn(),
  onSetThinking: vi.fn(),
  themePreference: { theme: "github" as const, scheme: "system" as const },
  onThemeChange: vi.fn(),
};

describe("SettingsPanel", () => {
  afterEach(cleanup);
  it("scheme 是可访问的单选 segmented control 并支持选择", () => {
    render(<SettingsPanel {...props} />);
    const group = screen.getByRole("radiogroup", { name: "色彩模式" });
    expect(group).toBeTruthy();
    expect(screen.getByRole("radio", { name: "System" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Light" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Dark" })).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
    expect(props.onThemeChange).toHaveBeenCalledWith({ theme: "github", scheme: "dark" });
  });

  it("模型控件为长名称保留完整 accessible name", () => {
    render(<SettingsPanel {...props} />);
    const model = screen.getByRole("combobox", { name: /模型：A very long model name/ });
    expect(model.getAttribute("title")).toBe("A very long model name");
  });

  it("主题选项组在浮层中保留明确名称", async () => {
    render(<SettingsPanel {...props} />);
    await userEvent.click(screen.getByRole("combobox", { name: "主题" }));
    expect(await screen.findByRole("group", { name: "主题" })).toBeTruthy();
    const options = await screen.findAllByRole("option");
    expect(options).toHaveLength(5);
    expect(options.every((option) => option.textContent?.includes("浅") && option.textContent.includes("深"))).toBe(true);
  });
});
