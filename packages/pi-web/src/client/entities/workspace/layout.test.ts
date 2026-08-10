import { describe, expect, it } from "vitest";
import { clampPanelWidth, loadPanelWidth, savePanelWidth } from "./layout.js";

function memStorage(init: Record<string, string> = {}) {
  const store = { ...init };
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
  } as Storage;
}

describe("侧边栏宽度持久化", () => {
  it("缺省 260；夹取 200-480", () => {
    expect(loadPanelWidth(memStorage())).toBe(260);
    expect(clampPanelWidth(100)).toBe(200);
    expect(clampPanelWidth(600)).toBe(480);
    expect(clampPanelWidth(320)).toBe(320);
  });

  it("保存后读取一致", () => {
    const storage = memStorage();
    savePanelWidth(storage, 380);
    expect(loadPanelWidth(storage)).toBe(380);
  });

  it("损坏数据回退缺省", () => {
    expect(loadPanelWidth(memStorage({ "pi:panel-width": "abc" }))).toBe(260);
    expect(loadPanelWidth(memStorage({ "pi:panel-width": "9999" }))).toBe(480);
  });
});
