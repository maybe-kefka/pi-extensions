import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 后端构建（扩展入口）：SSR 目标，产物 dist/server/index.js（node_modules 自动 external）
export default defineConfig({
  build: {
    ssr: path.resolve(__dirname, "src/index.ts"),
    outDir: path.resolve(__dirname, "dist/server"),
    emptyOutDir: true,
    target: "node22",
  },
  resolve: {
    alias: {
      // 后端用相对路径，无需别名；保留空对象避免意外解析
    },
  },
});
