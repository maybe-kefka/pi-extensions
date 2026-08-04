import { defineConfig } from "vitest/config";

// 包级 vitest 配置：prepublishOnly 的 `npm test` 在包目录运行时使用
// （根配置的 include 路径相对仓库根，包目录内跑会 "No test files found"）。
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/*.test.ts"],
  },
});
