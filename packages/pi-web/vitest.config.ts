import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "web/src"),
    },
  },
  test: {
    environment: "node",
    include: ["test/*.test.ts", "web/src/**/*.test.{ts,tsx}"],
    environmentMatchGlobs: [["web/src/components/**/*.test.tsx", "jsdom"]],
  },
});
