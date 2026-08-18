// @vitest-environment jsdom
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsPanel } from "./SettingsPanel";

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
});
