/**
 * git 执行适配（infrastructure 层）：spawn shell:false（无 shell 注入面）+ 10s 超时。
 * 命令参数由 domain/git 白名单校验后传入。
 */

import { spawn } from "node:child_process";
import type { GitRunner } from "../domain/git.js";

const GIT_TIMEOUT_MS = 10_000;

export function createGitRunner(cwd: string): GitRunner {
  return (args) =>
    new Promise((resolve) => {
      let proc;
      try {
        proc = spawn("git", args, { cwd, shell: false, stdio: ["ignore", "pipe", "pipe"] });
      } catch {
        resolve({ code: 1, stdout: "", stderr: "git spawn failed" });
        return;
      }
      let stdout = "";
      let stderr = "";
      let settled = false;
      const finish = (code: number) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ code, stdout, stderr });
      };
      const timer = setTimeout(() => {
        proc.kill("SIGKILL");
      }, GIT_TIMEOUT_MS);
      proc.stdout?.on("data", (d: Buffer) => {
        stdout += d.toString();
      });
      proc.stderr?.on("data", (d: Buffer) => {
        stderr += d.toString();
      });
      proc.on("close", (code) => finish(code ?? 1));
      proc.on("error", () => finish(1));
    });
}
