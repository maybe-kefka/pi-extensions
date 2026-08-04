import path from "node:path";
import { defineConfig } from "vitest/config";

const root = __dirname;

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(root, "packages/pi-web/web/src"),
    },
  },
  test: {
    environment: "node",
    include: [
      "packages/pi-status/test/*.test.ts",
      "packages/pi-notify-termux/test/*.test.ts",
      "packages/pi-web/test/*.test.ts",
      "packages/pi-web/web/src/**/*.test.{ts,tsx}",
    ],
    environmentMatchGlobs: [["packages/pi-web/web/src/components/**/*.test.tsx", "jsdom"]],
  },
});
