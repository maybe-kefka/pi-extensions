import { describe, expect, it } from "vitest";
import {
  decodeReply,
  encodeCancelFile,
  encodeReplyFile,
  parseFileName,
} from "../src/replies.js";

describe("encodeReplyFile / parseFileName", () => {
  it("encodes notify reply files", () => {
    expect(encodeReplyFile("notify", "1725000000")).toBe("notify-1725000000.reply");
  });

  it("encodes ask reply files", () => {
    expect(encodeReplyFile("ask", "abc123")).toBe("ask-abc123.reply");
  });

  it("parses valid reply file names", () => {
    expect(parseFileName("notify-1725000000.reply")).toEqual({ kind: "notify", id: "1725000000", type: "reply" });
    expect(parseFileName("ask-abc123.reply")).toEqual({ kind: "ask", id: "abc123", type: "reply" });
    expect(parseFileName("ask-a_b-9.reply")).toEqual({ kind: "ask", id: "a_b-9", type: "reply" });
  });

  it("encodes and parses cancel files", () => {
    expect(encodeCancelFile("abc123")).toBe("ask-abc123.cancel");
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
