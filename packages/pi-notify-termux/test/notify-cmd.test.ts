import { describe, expect, it } from "vitest";
import {
  buildAskInputArgs,
  buildAskOptionsArgs,
  buildDiagnosticArgs,
  buildOnDeleteArg,
  buildResultNotificationArgs,
  buildStatusNotificationArgs,
} from "../src/notify-cmd.js";

const HELPER = "/data/data/com.termux/files/home/.pi/pi-notify-termux/helper.sh";
// Termux's own am wrapper (termux-am, app_process-based): the system
// /system/bin/am is a shell-uid tool and is rejected on Android 10+.
const AM = "/data/data/com.termux/files/usr/bin/am";
const TOAST = "/data/data/com.termux/files/usr/bin/termux-toast";

describe("buildResultNotificationArgs", () => {
  const args = buildResultNotificationArgs({
    title: "✅ pi · 09:05",
    content: "第一行\n第二行",
    helperPath: HELPER,
    amPath: AM,
    toastPath: TOAST,
    ts: 1725000000,
  });

  it("uses fixed result id for in-place replacement", () => {
    expect(args).toContain("--id");
    expect(args[args.indexOf("--id") + 1]).toBe("pi-notify-result");
  });

  it("passes title and content verbatim", () => {
    expect(args[args.indexOf("--title") + 1]).toBe("✅ pi · 09:05");
    expect(args[args.indexOf("--content") + 1]).toBe("第一行\n第二行");
  });

  it("has reply button with literal $REPLY routed to helper", () => {
    expect(args[args.indexOf("--button1") + 1]).toBe("回复");
    const action = args[args.indexOf("--button1-action") + 1];
    expect(action).toBe(`${HELPER} notify 1725000000 "$REPLY"`);
    expect(action).toContain("$REPLY");
  });

  it("has open-terminal button via termux am with failure fallback toast", () => {
    expect(args[args.indexOf("--button2") + 1]).toBe("打开终端");
    expect(args[args.indexOf("--button2-action") + 1]).toBe(
      `${AM} start -n com.termux/.app.TermuxActivity || ${TOAST} 后台启动被拒：请在系统设置中允许 Termux 后台弹出界面`,
    );
  });

  it("returns a flat argv array without shell metacharacters", () => {
    expect(args.every((a) => typeof a === "string" && a.length > 0)).toBe(true);
    expect(args.some((a) => a.includes("&&") || a.includes(";"))).toBe(false);
  });
});

describe("buildAskOptionsArgs", () => {
  const base = { id: "abc123", title: "❓ pi 提问 · 12:30", content: "继续构建？\n1) 继续\n2) 跳过", helperPath: HELPER };

  it("maps each option to a numbered button with fixed id", () => {
    const args = buildAskOptionsArgs({ ...base, options: ["继续", "跳过"] });
    expect(args[args.indexOf("--id") + 1]).toBe("ask-abc123");
    expect(args[args.indexOf("--button1") + 1]).toBe("继续");
    expect(args[args.indexOf("--button1-action") + 1]).toBe(`${HELPER} ask abc123 1`);
    expect(args[args.indexOf("--button2") + 1]).toBe("跳过");
    expect(args[args.indexOf("--button2-action") + 1]).toBe(`${HELPER} ask abc123 2`);
  });

  it("supports up to three options", () => {
    const args = buildAskOptionsArgs({ ...base, options: ["a", "b", "c"] });
    expect(args[args.indexOf("--button3-action") + 1]).toBe(`${HELPER} ask abc123 3`);
  });

  it("throws on zero options", () => {
    expect(() => buildAskOptionsArgs({ ...base, options: [] })).toThrow();
  });

  it("throws on more than three options", () => {
    expect(() => buildAskOptionsArgs({ ...base, options: ["a", "b", "c", "d"] })).toThrow();
  });
});

describe("buildAskInputArgs", () => {
  it("has single reply button with literal $REPLY", () => {
    const args = buildAskInputArgs({
      id: "xyz",
      title: "❓ pi 提问 · 12:30",
      content: "请输入：",
      helperPath: HELPER,
    });
    expect(args[args.indexOf("--id") + 1]).toBe("ask-xyz");
    expect(args[args.indexOf("--button1") + 1]).toBe("回复");
    expect(args[args.indexOf("--button1-action") + 1]).toBe(`${HELPER} ask xyz "$REPLY"`);
  });
});

describe("buildOnDeleteArg", () => {
  it("routes dismissal to helper cancel", () => {
    expect(buildOnDeleteArg({ id: "abc123", helperPath: HELPER })).toEqual([
      "--on-delete",
      `${HELPER} cancel abc123`,
    ]);
  });
});

describe("buildStatusNotificationArgs", () => {
  it("replaces a notification with a plain status notice (same id, no buttons)", () => {
    const args = buildStatusNotificationArgs({
      id: "ask-abc123",
      title: "✅ pi",
      content: "已收到你的回复 ✓",
    });
    expect(args[args.indexOf("--id") + 1]).toBe("ask-abc123");
    expect(args[args.indexOf("--title") + 1]).toBe("✅ pi");
    expect(args[args.indexOf("--content") + 1]).toBe("已收到你的回复 ✓");
    expect(args.some((a) => a.startsWith("--button"))).toBe(false);
  });
});

describe("buildDiagnosticArgs", () => {
  it("posts a silent self-check notification (alert-once, no buttons)", () => {
    const args = buildDiagnosticArgs({ id: "pi-perm-diag", title: "🔍 pi", content: "权限自检" });
    expect(args[args.indexOf("--id") + 1]).toBe("pi-perm-diag");
    expect(args).toContain("--alert-once");
    expect(args.some((a) => a.startsWith("--button"))).toBe(false);
  });
});
