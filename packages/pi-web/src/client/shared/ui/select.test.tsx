// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "./select";

HTMLElement.prototype.hasPointerCapture ??= vi.fn(() => false);
HTMLElement.prototype.setPointerCapture ??= vi.fn();
HTMLElement.prototype.releasePointerCapture ??= vi.fn();
HTMLElement.prototype.scrollIntoView ??= vi.fn();

afterEach(cleanup);

describe("SelectContent modal isolation", () => {
  it("浮层打开时让 Radix 隐藏的应用根不可聚焦，并在关闭时恢复", async () => {
    const { container } = render(
      <Select defaultValue="a">
        <SelectTrigger aria-label="示例选择">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>示例</SelectLabel>
            <SelectItem value="a">A</SelectItem>
            <SelectItem value="b">B</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>,
    );

    await userEvent.click(screen.getByRole("combobox", { name: "示例选择" }));
    await waitFor(() => expect(container.inert).toBe(true));

    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(container.inert).toBe(false));
  });
});
