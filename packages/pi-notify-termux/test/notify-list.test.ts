import { describe, expect, it } from "vitest";
import {
  findPiNotifications,
  parseNotificationList,
  renderNotificationStatus,
} from "../src/notify-list.js";

const RESULT_ID = "pi-notify-result";

describe("parseNotificationList", () => {
  it("parses a valid notification list", () => {
    const list = parseNotificationList(
      JSON.stringify([
        { tag: "pi-notify-result", packageName: "com.termux.api", title: "✅ pi", content: "x" },
        { tag: "ask-abc", packageName: "com.termux.api", title: "❓", content: "y" },
        { tag: "", packageName: "tv.danmaku.bili", title: "B站", content: "z" },
      ]),
    );
    expect(list).toHaveLength(3);
    expect(list[0]).toMatchObject({ tag: "pi-notify-result", packageName: "com.termux.api" });
  });

  it("returns [] on garbage / missing tag", () => {
    expect(parseNotificationList("not json")).toEqual([]);
    expect(parseNotificationList("")).toEqual([]);
    expect(parseNotificationList(JSON.stringify([{ title: "no tag" }]))).toEqual([]);
    expect(parseNotificationList(JSON.stringify("string"))).toEqual([]);
  });
});

describe("findPiNotifications", () => {
  const list = parseNotificationList(
    JSON.stringify([
      { tag: "pi-notify-result", packageName: "com.termux.api" },
      { tag: "ask-abc123", packageName: "com.termux.api" },
      { tag: "ask-xyz", packageName: "com.termux.api" },
      { tag: "", packageName: "tv.danmaku.bili" },
    ]),
  );

  it("finds result and ask notifications", () => {
    const f = findPiNotifications(list, RESULT_ID);
    expect(f.result).toBe(true);
    expect(f.asks).toEqual(["abc123", "xyz"]);
  });

  it("reports absent when nothing of ours is in the shade", () => {
    const f = findPiNotifications(
      [{ tag: "", packageName: "com.other", title: "a", content: "" }],
      RESULT_ID,
    );
    expect(f.result).toBe(false);
    expect(f.asks).toEqual([]);
  });
});

describe("renderNotificationStatus", () => {
  it("renders lines for present pi notifications", () => {
    const lines = renderNotificationStatus(
      { result: true, asks: ["abc123"] },
      RESULT_ID,
    );
    expect(lines.join("\n")).toContain("结果通知");
    expect(lines.join("\n")).toContain("abc123");
  });

  it("renders a clear line when nothing is in the shade", () => {
    const lines = renderNotificationStatus({ result: false, asks: [] }, RESULT_ID);
    expect(lines.join("\n")).toContain("无 pi 通知");
  });
});
