// Smoke test: load the extension exactly like pi does (jiti from pi's own
// node_modules) and run the factory with a fake pi API. Verifies imports
// (CONFIG_DIR_NAME value import, typebox alias), registration calls, and that
// the factory returns without throwing.
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  // Resolve @earendil-works/pi-coding-agent from pi's install so the
  // CONFIG_DIR_NAME value import works at runtime.
  alias: {
    "@earendil-works/pi-coding-agent":
      "/data/data/com.termux/files/usr/lib/node_modules/@earendil-works/pi-coding-agent/dist/extensions/index.js",
    typebox:
      "/data/data/com.termux/files/usr/lib/node_modules/@earendil-works/pi-coding-agent/node_modules/typebox/build/index.mjs",
  },
});

const mod = await jiti.import(
  "/data/data/com.termux/files/home/projects/pi-extensions/packages/pi-notify-termux/src/index.ts",
);

const registered = { commands: [], tools: [], events: [] };
const fakePi = {
  registerCommand(name, def) {
    registered.commands.push(name);
    if (typeof def.handler !== "function") throw new Error(`command ${name}: handler missing`);
  },
  registerTool(def) {
    registered.tools.push(def.name);
    if (!def.parameters || typeof def.execute !== "function") {
      throw new Error(`tool ${def.name}: parameters/execute missing`);
    }
  },
  on(event, fn) {
    registered.events.push(event);
    if (typeof fn !== "function") throw new Error(`event ${event}: handler missing`);
  },
  sendUserMessage() {},
};

const factory = mod.default ?? mod;
await factory(fakePi);

console.log("OK commands:", registered.commands.join(","));
console.log("OK tools:   ", registered.tools.join(","));
console.log("OK events:  ", registered.events.join(","));
