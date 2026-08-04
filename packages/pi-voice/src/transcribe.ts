/**
 * @kefka/pi-voice — pure functions for the /voice command.
 *
 * No I/O here (except pure string/env manipulation): resolve paths from the
 * environment, build the whisper-cli argument vector, and parse its stdout
 * into clean transcript text. All testable without a real whisper install.
 */

export interface WhisperPaths {
	cli: string;
	model: string;
}

/**
 * Resolve whisper-cli / model locations.
 * Defaults to the canonical Termux build layout under $HOME/whisper.cpp;
 * override with PI_VOICE_CLI / PI_VOICE_MODEL env vars.
 */
export function resolveWhisperPaths(env: Record<string, string | undefined> = {}): WhisperPaths {
	const home = env.HOME ?? "";
	return {
		cli: env.PI_VOICE_CLI ?? `${home}/whisper.cpp/build/bin/whisper-cli`,
		model: env.PI_VOICE_MODEL ?? `${home}/whisper.cpp/models/ggml-base-q5_0.bin`,
	};
}

export interface TranscribeOptions {
	model: string;
	input: string;
	language?: string;
	/** false → keep [start --> end] timestamps in output */
	noTimestamps?: boolean;
}

/** Build the whisper-cli argv for transcribing `input` with `model`. */
export function buildTranscribeArgs(opts: TranscribeOptions): string[] {
	const args = ["-m", opts.model, "-f", opts.input, "-l", opts.language ?? "zh"];
	if (opts.noTimestamps !== false) {
		args.push("-nt");
	}
	return args;
}

/** Log-line prefixes emitted by whisper-cli (timings, init, progress). */
const LOG_PREFIX_RE =
	/^(whisper_|main:|system_info:|ggml_|load time|fallbacks|mel time|sample time|encode time|decode time|batchd time|prompt time|total time)/;

/** Strip whisper-cli noise (timings/init/progress) and keep transcript text. */
export function parseTranscribeOutput(stdout: string): string {
	return stdout
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0 && !LOG_PREFIX_RE.test(line))
		.join("\n");
}

/** Error message when the whisper runtime is not installed/configured. */
export function renderNotReady(missing: Array<"cli" | "model">): string {
	return `whisper.cpp 未就绪：缺少 ${missing.join("、")}（见 docs/SPEC.md 安装说明，或用 PI_VOICE_CLI/PI_VOICE_MODEL 指定路径）`;
}
