import { describe, expect, it } from "vitest";
import { buildHelperScript } from "../src/helper.js";

const OPTS = {
  repliesDir: "/data/data/com.termux/files/home/.pi/pi-notify-termux/replies",
  shBin: "/data/data/com.termux/files/usr/bin/sh",
  removeBin: "/data/data/com.termux/files/usr/bin/termux-notification-remove",
  resultId: "pi-notify-result",
};

describe("buildHelperScript", () => {
  it("uses the termux sh as shebang and embeds replies dir", () => {
    const s = buildHelperScript(OPTS);
    expect(s.startsWith("#!${OPTS.shBin}")).toBe(false);
    expect(s.startsWith(`#!${OPTS.shBin}`)).toBe(true);
    expect(s).toContain(`replies_dir="${OPTS.repliesDir}"`);
  });

  it("notify branch writes reply file then removes the result notification", () => {
    const s = buildHelperScript(OPTS);
    const branch = s.slice(s.indexOf("notify)"), s.indexOf("ask)"));
    expect(branch).toContain(`printf '%s' "$text" > "$replies_dir/notify-${"${ts}"}.reply"`);
    expect(branch).toContain(`"${OPTS.removeBin}" --id "${OPTS.resultId}"`);
  });

  it("ask branch writes reply file then removes its own notification", () => {
    const s = buildHelperScript(OPTS);
    const branch = s.slice(s.indexOf("ask)"), s.indexOf("cancel)"));
    expect(branch).toContain(`printf '%s' "$text" > "$replies_dir/ask-${"${id}"}.reply"`);
    expect(branch).toContain(`"${OPTS.removeBin}" --id "ask-${"${id}"}"`);
  });

  it("cancel branch only writes the cancel marker", () => {
    const s = buildHelperScript(OPTS);
    const branch = s.slice(s.indexOf("cancel)"));
    expect(branch).toContain(`: > "$replies_dir/ask-${"${id}"}.cancel"`);
    expect(branch).not.toContain(OPTS.removeBin);
  });

  it("never interpolates reply text into shell code (printf %s only)", () => {
    const s = buildHelperScript(OPTS);
    expect(s).not.toContain("eval ");
    expect(s).toContain("printf '%s'");
  });
});
