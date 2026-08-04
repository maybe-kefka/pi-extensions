import { describe, expect, it } from "vitest";
import {
  decodeReply,
  parseFileName,
  parseOptionSelection,
} from "../src/replies.js";

describe("parseFileName", () => {
  it("parses valid reply and cancel file names", () => {
    expect(parseFileName("notify-1725000000.reply")).toEqual({ kind: "notify", id: "1725000000", type: "reply" });
    expect(parseFileName("ask-abc123.reply")).toEqual({ kind: "ask", id: "abc123", type: "reply" });
    expect(parseFileName("ask-a_b-9.reply")).toEqual({ kind: "ask", id: "a_b-9", type: "reply" });
    expect(parseFileName("ask-abc123.cancel")).toEqual({ kind: "ask", id: "abc123", type: "cancel" });
  });

  it("rejects malformed names", () => {
    expect(parseFileName("notify-.reply")).toBeNull();
    expect(parseFileName("foo.reply")).toBeNull();
    expect(parseFileName("ask-a/b.reply")).toBeNull();
    expect(parseFileName("ask-..reply")).toBeNull();
    expect(parseFileName("ask-abc")).toBeNull();
    expect(parseFileName("ask-abc123.txt")).toBeNull();
    expect(parseFileName("")).toBeNull();
  });

  it("rejects ids containing path separators or traversal", () => {
    expect(parseFileName("ask-..%2f.reply")).toBeNull();
    expect(parseFileName("ask-a\\b.reply")).toBeNull();
  });
});

describe("decodeReply", () => {
  it("passes text through verbatim", () => {
    expect(decodeReply("hello")).toEqual({ text: "hello" });
    expect(decodeReply('他说 "好"')).toEqual({ text: '他说 "好"' });
    expect(decodeReply("line1\nline2")).toEqual({ text: "line1\nline2" });
    expect(decodeReply("$HOME and $REPLY")).toEqual({ text: "$HOME and $REPLY" });
  });

  it("treats empty input as cancellation", () => {
    expect(decodeReply("")).toBeNull();
    expect(decodeReply("   ")).toBeNull();
  });
});

describe("parseOptionSelection", () => {
  it("maps a numeric reply to its option", () => {
    const r = parseOptionSelection("2", ["继续", "跳过"]);
    expect(r).toEqual({ selection: 2, option: "跳过", text: "跳过" });
  });

  it("returns null for non-numeric or out-of-range replies", () => {
    expect(parseOptionSelection("abc", ["继续", "跳过"])).toBeNull();
    expect(parseOptionSelection("3", ["继续", "跳过"])).toBeNull();
    expect(parseOptionSelection("0", ["继续", "跳过"])).toBeNull();
    expect(parseOptionSelection("", ["继续", "跳过"])).toBeNull();
  });

  it("returns null when there are no options (free input)", () => {
    expect(parseOptionSelection("1", [])).toBeNull();
  });
});
