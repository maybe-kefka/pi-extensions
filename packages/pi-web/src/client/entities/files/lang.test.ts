import { describe, expect, it } from "vitest";
import { langForFile } from "./lang.js";

describe("langForFile", () => {
  it("常见扩展名映射正确", () => {
    expect(langForFile("a.ts")).toBe("javascript");
    expect(langForFile("a.tsx")).toBe("javascript");
    expect(langForFile("a.js")).toBe("javascript");
    expect(langForFile("a.json")).toBe("json");
    expect(langForFile("a.css")).toBe("css");
    expect(langForFile("a.html")).toBe("html");
    expect(langForFile("a.md")).toBe("markdown");
    expect(langForFile("a.py")).toBe("python");
  });

  it("扩展名大小写不敏感", () => {
    expect(langForFile("A.TS")).toBe("javascript");
    expect(langForFile("a.MD")).toBe("markdown");
  });

  it("无扩展名或未知扩展名返回 null", () => {
    expect(langForFile("Makefile")).toBeNull();
    expect(langForFile("a.unknown")).toBeNull();
    expect(langForFile(".gitignore")).toBeNull();
    expect(langForFile("")).toBeNull();
  });
});
