import { describe, expect, it } from "vitest";
import {
	buildTranscribeArgs,
	parseTranscribeOutput,
	renderNotReady,
	resolveWhisperPaths,
} from "../src/transcribe.js";

describe("resolveWhisperPaths", () => {
	it("defaults to $HOME/whisper.cpp canonical Termux layout", () => {
		expect(resolveWhisperPaths({ HOME: "/data/data/com.termux/files/home" })).toEqual({
			cli: "/data/data/com.termux/files/home/whisper.cpp/build/bin/whisper-cli",
			model: "/data/data/com.termux/files/home/whisper.cpp/models/ggml-base-q5_0.bin",
		});
	});

	it("respects PI_VOICE_CLI / PI_VOICE_MODEL overrides", () => {
		expect(
			resolveWhisperPaths({
				HOME: "/h",
				PI_VOICE_CLI: "/opt/whisper-cli",
				PI_VOICE_MODEL: "/m/ggml.bin",
			}),
		).toEqual({ cli: "/opt/whisper-cli", model: "/m/ggml.bin" });
	});

	it("handles empty env gracefully", () => {
		expect(resolveWhisperPaths({})).toEqual({
			cli: "/whisper.cpp/build/bin/whisper-cli",
			model: "/whisper.cpp/models/ggml-base-q5_0.bin",
		});
	});
});

describe("buildTranscribeArgs", () => {
	it("builds zh + no-timestamps args by default", () => {
		expect(
			buildTranscribeArgs({ model: "/m.bin", input: "/a.wav" }),
		).toEqual(["-m", "/m.bin", "-f", "/a.wav", "-l", "zh", "-nt"]);
	});

	it("honors explicit language and keeps timestamps when requested", () => {
		expect(
			buildTranscribeArgs({
				model: "/m.bin",
				input: "/a.wav",
				language: "en",
				noTimestamps: false,
			}),
		).toEqual(["-m", "/m.bin", "-f", "/a.wav", "-l", "en"]);
	});
});

describe("parseTranscribeOutput", () => {
	const SAMPLE_STDOUT = [
		"whisper_init_from_file_with_params_no_state: loading model from 'models/ggml-base-q5_0.bin'",
		"system_info: n_threads = 4 / 8 | WHISPER : COREML = 0 | CPU : NEON = 1",
		"main: processing 'a.wav' (480000 samples, 30.0 sec), 4 threads, 1 processors",
		"",
		"我突然想到react的不是这个就算是轮许吗",
		"那按理来说react可以暂停对吧你停止了不就是暂停了吗",
		"whisper_print_timings:     total time =  2799.19 ms",
		"",
	].join("\n");

	it("keeps transcript lines and drops log/timing noise", () => {
		expect(parseTranscribeOutput(SAMPLE_STDOUT)).toBe(
			"我突然想到react的不是这个就算是轮许吗\n那按理来说react可以暂停对吧你停止了不就是暂停了吗",
		);
	});

	it("returns empty string for pure noise output", () => {
		expect(parseTranscribeOutput("whisper_init: loading\nmain: processing...\n")).toBe("");
	});

	it("returns empty string for empty input", () => {
		expect(parseTranscribeOutput("")).toBe("");
	});
});

describe("renderNotReady", () => {
	it("lists missing components", () => {
		expect(renderNotReady(["cli"])).toContain("cli");
		expect(renderNotReady(["cli", "model"])).toContain("cli、model");
	});
});
