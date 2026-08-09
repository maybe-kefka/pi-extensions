import { spawn } from "node:child_process";
const PORT = Number(process.env.PORT ?? 39799);
const p = spawn("pi", ["--mode", "rpc", "--no-session", "--extension", "packages/pi-web/src/index.ts"], {
  stdio: ["pipe", "pipe", "inherit"], cwd: process.cwd(),
});
p.stdout.on("data", (d) => {
  for (const l of d.toString().split("\n")) {
    if (!l.trim()) continue;
    try { const m = JSON.parse(l); if (m.method === "notify" && typeof m.message === "string" && m.message.includes("http")) console.log("WEB_URL=" + m.message.trim()); } catch {}
  }
});
p.stdin.write(JSON.stringify({ id: "req-1", type: "prompt", message: `/web --port ${PORT}` }) + "\n");
process.on("SIGTERM", () => p.kill());
