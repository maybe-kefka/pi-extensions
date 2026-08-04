/**
 * @kefka/pi-voice — /voice extension.
 *
 * Thin wiring layer: `/voice <audio-file>` transcribes the file with a local
 * whisper.cpp build and reports the result via ui.notify + a sidecar .txt
 * file next to the input. All logic lives in src/transcribe.ts (pure).
 */

import { spawn } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	buildTranscribeArgs,
	parseTranscribeOutput,
	renderNotReady,
	resolveWhisperPaths,
} from "./transcribe.js";

const TRANSCRIBE_TIMEOUT_MS = 300_000;

function runTranscribe(
	cli: string,
	args: string[],
	timeoutMs: number,
): Promise<{ stdout: string; stderr: string }> {
	return new Promise((resolve, reject) => {
		const child = spawn(cli, args, { stdio: ["ignore", "pipe", "pipe"] });
		let stdout = "";
		let stderr = "";
		child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
		child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
		const timer = setTimeout(() => {
			child.kill("SIGKILL");
			reject(new Error(`转写超时（>${Math.round(timeoutMs / 1000)}s）`));
		}, timeoutMs);
		child.on("error", (e) => {
			clearTimeout(timer);
			reject(e);
		});
		child.on("close", (code) => {
			clearTimeout(timer);
			if (code === 0) resolve({ stdout, stderr });
			else reject(new Error(stderr.trim().split("\n")[0] || `whisper-cli 退出码 ${code}`));
		});
	});
}

export default function voiceExtension(pi: ExtensionAPI): void {
	pi.registerCommand("voice", {
		description: "Transcribe an audio file to Chinese text using local whisper.cpp",
		handler: async (arg, ctx) => {
			const raw = (arg ?? "").trim();
			if (raw === "") {
				ctx.ui.notify("/voice <音频文件> — 本地 whisper.cpp 离线转写（如 /voice 微信录音.aac）", "info");
				return;
			}

			const paths = resolveWhisperPaths(process.env);
			const missing: Array<"cli" | "model"> = [];
			if (!existsSync(paths.cli)) missing.push("cli");
			if (!existsSync(paths.model)) missing.push("model");
			if (missing.length > 0) {
				ctx.ui.notify(renderNotReady(missing), "error");
				return;
			}

			const input = raw.startsWith("/") ? raw : `${process.cwd()}/${raw}`;
			if (!existsSync(input)) {
				ctx.ui.notify(`文件不存在: ${input}`, "error");
				return;
			}

			try {
				const { stdout, stderr } = await runTranscribe(
					paths.cli,
					buildTranscribeArgs({ model: paths.model, input }),
					TRANSCRIBE_TIMEOUT_MS,
				);
				const text = parseTranscribeOutput(stdout);
				if (text === "") {
					ctx.ui.notify(`未识别出内容${stderr ? `（${stderr.split("\n")[0]}）` : ""}`, "error");
					return;
				}
				const out = `${input}.txt`;
				writeFileSync(out, text);
				const preview = text.length > 48 ? `${text.slice(0, 48)}…` : text;
				ctx.ui.notify(`🎤 ${text.length} 字 | ${preview} | 全文: ${out}`, "info");
			} catch (e) {
				ctx.ui.notify(`转写失败：${String(e instanceof Error ? e.message : e)}`, "error");
			}
		},
	});
}
