import { existsSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { SubprocessError, type SubprocessOptions, type SubprocessResult } from "@/lib/llm/subprocess";
import { createFakeSubprocess } from "@/lib/llm/subprocess-fake";
import { analyzeLocalVideo } from "@/lib/video-analysis/analyze-local";
import { analyzeClaudeFramesFile, buildClaudeFramesArgs, checkClaudeFramesAvailable, mergeOutput, readClaudeFramesConfig } from "@/lib/video-analysis/claude-frames";
import { createVideoAnalyzer } from "@/lib/video-analysis/backend";
import { FRAMES_PROMPT_VERSION } from "@/lib/video-analysis/claude-frames-prompt";
import { tempRootDir } from "@/lib/video-analysis/temp-dir";
import { makeBaseDir, NOW, validOutput } from "@/lib/video-analysis/test-support";
import type { PipelineOptions } from "@/lib/video-analysis/types";

const base = makeBaseDir();
afterAll(() => base.cleanup());

const WHISPER = JSON.stringify({
  language: "en",
  text: "Most people think healing takes years. But your body can renew itself in thirty days. Here is how.",
  segments: [
    { start: 0, end: 3, text: "Most people think healing takes years." },
    { start: 3, end: 7, text: "But your body can renew itself in thirty days." },
    { start: 7, end: 9, text: "Here is how." },
  ],
});

const OPTIONS: PipelineOptions = { identity: { backend: "claude_frames", model: "sonnet" }, analyzeFile: analyzeClaudeFramesFile, shrink: false };

function envelope(structured: unknown): string {
  return JSON.stringify({
    type: "result",
    subtype: "success",
    is_error: false,
    result: "",
    structured_output: structured,
    total_cost_usd: 0.01,
    usage: { input_tokens: 100, output_tokens: 50 },
    modelUsage: { "claude-sonnet-5-5": { canonicalModel: "claude-sonnet-5-5" } },
  });
}

/** Model yalnız ekran yazısını verir; konuşmayı Whisper'dan kod ekler. */
const modelAnswer = () => validOutput({ transcript: [{ startSec: 6, text: "Comment RENEW for the guide", channel: "screen" }] });

interface Behaviour {
  claude?: (n: number, options: SubprocessOptions) => Partial<SubprocessResult> | Promise<Partial<SubprocessResult>>;
  whisper?: Partial<SubprocessResult> | (() => never);
  ffmpegExit?: number;
}

/** Komuta göre yanıt veren sahte çalıştırıcı: ffmpeg kare yazar, python Whisper JSON'u, claude zarf döner. */
function pipelineRunner(behaviour: Behaviour = {}) {
  let claudeCalls = 0;
  return createFakeSubprocess((options) => {
    if (options.command === "ffmpeg") {
      if (behaviour.ffmpegExit) return { exitCode: behaviour.ffmpegExit };
      writeFileSync(String(options.args?.at(-1)), "jpg");
      return {};
    }
    if (options.command === "python3") {
      if (typeof behaviour.whisper === "function") return behaviour.whisper();
      return behaviour.whisper ?? { stdout: WHISPER };
    }
    if (options.command === "claude") {
      const n = claudeCalls++;
      return behaviour.claude ? behaviour.claude(n, options) : { stdout: envelope(modelAnswer()), durationMs: 5_000 };
    }
    throw new Error(`beklenmeyen komut: ${options.command}`);
  });
}

let source = "";
beforeEach(() => {
  source = path.join(mkdtempSync(path.join(base.dir, "src-")), "clip.mp4");
  writeFileSync(source, "video");
});

const run = (fake: ReturnType<typeof pipelineRunner>, durationSec: number | undefined = 9, env: Record<string, string> = {}) =>
  analyzeLocalVideo({ contentId: "c1", isCompetitor: true, caption: "Comment RENEW", durationSec }, source, { runner: fake.runner, env, now: () => NOW, tempBaseDir: base.dir }, OPTIONS);

const tempRootEmpty = () => !existsSync(tempRootDir(base.dir)) || readdirSync(tempRootDir(base.dir)).length === 0;

describe("claude_frames hattı (sahte alt süreçler)", () => {
  it("başarı: konuşma Whisper'dan (speech kanalı), ekran yazısı modelden; kimlik claude_frames; kanıt denetimi geçer", async () => {
    const fake = pipelineRunner();
    const result = await run(fake);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result).toMatchObject({ backend: "claude_frames", model: "sonnet", promptVersion: FRAMES_PROMPT_VERSION, evidenceVerified: true });
    expect(result.transcript).toMatchObject({ provider: "claude_cli", language: "en", isMeaningful: true });
    expect(result.transcript.text).toBe("Most people think healing takes years. But your body can renew itself in thirty days. Here is how.");
    expect(result.transcript.segments.filter((s) => s.channel === "speech")).toHaveLength(3);
    expect(result.transcript.segments.filter((s) => s.channel === "screen").map((s) => s.text)).toEqual(["Comment RENEW for the guide"]);
    expect(result.transcript.expiresAt).toBeDefined(); // rakip: 90 gün
    expect(result.analysis.hookText).toBe("Most people think healing takes years.");
    expect(result.stats).toMatchObject({ calls: 1, correctionTurns: 0, inputTokens: 100, outputTokens: 50, totalTokens: 150 });
  });

  it("Claude çağrısı: Read dışında araç yok, güvenli kip, API anahtarı geçmez, cwd kare klasörü, istem kareleri ve konuşmayı içerir", async () => {
    const fake = pipelineRunner();
    await run(fake);
    const call = fake.calls.find((c) => c.command === "claude");
    expect(call).toBeDefined();
    const args = call?.args ?? [];
    expect(args[args.indexOf("--tools") + 1]).toBe("Read");
    expect(args).toEqual(expect.arrayContaining(["--safe-mode", "--strict-mcp-config", "--permission-prompts", "none", "--no-session-persistence"]));
    expect(args[args.indexOf("--model") + 1]).toBe("sonnet");
    expect(JSON.parse(args[args.indexOf("--json-schema") + 1]).type).toBe("object");
    expect(call?.passEnv).not.toContain("ANTHROPIC_API_KEY");
    expect(call?.cwd).toContain("panel-video");
    expect(call?.input).toContain("frame-01.jpg");
    expect(call?.input).toContain("Most people think healing takes years.");
    expect(call?.timeoutMs).toBeLessThanOrEqual(180_000);
  });

  it("komut satırı argümanları Windows sınırının altında", () => {
    expect(buildClaudeFramesArgs({ model: "sonnet" }).join(" ").length).toBeLessThan(24_000);
  });

  it("model/yol ortamdan: VIDEO_ANALYSIS_CLAUDE_MODEL, CLAUDE_CLI_PATH", async () => {
    expect(readClaudeFramesConfig({})).toEqual({ bin: "claude", model: "sonnet", timeoutMs: 180_000 });
    const fake = pipelineRunner();
    await run(fake, 9, { VIDEO_ANALYSIS_CLAUDE_MODEL: "opus", CLAUDE_CLI_PATH: "/opt/claude" });
    const call = fake.calls.find((c) => c.command === "/opt/claude");
    expect(call?.args?.[(call.args?.indexOf("--model") ?? 0) + 1]).toBe("opus");
  });

  it("kare tavanı: 10 dakikalık videoda bile en çok 12 ffmpeg kare çağrısı", async () => {
    const fake = pipelineRunner();
    await run(fake, 600);
    expect(fake.calls.filter((c) => c.command === "ffmpeg")).toHaveLength(12);
  });

  it("süre verilmezse ffprobe ile okunur", async () => {
    const fake = createFakeSubprocess((options) => {
      if (options.command === "ffprobe") return { stdout: "9.0\n" };
      if (options.command === "ffmpeg") writeFileSync(String(options.args?.at(-1)), "jpg");
      if (options.command === "python3") return { stdout: WHISPER };
      if (options.command === "claude") return { stdout: envelope(modelAnswer()) };
      return {};
    });
    const result = await analyzeLocalVideo({ contentId: "c3", isCompetitor: false }, source, { runner: fake.runner, env: {}, now: () => NOW, tempBaseDir: base.dir }, OPTIONS);
    expect(result.status).toBe("ok");
    expect(fake.calls.some((c) => c.command === "ffprobe")).toBe(true);
  });

  it("bozuk JSON → TEK düzeltme turu → başarı", async () => {
    const fake = pipelineRunner({
      claude: (n) => (n === 0 ? { stdout: JSON.stringify({ type: "result", subtype: "success", is_error: false, result: "bu JSON değil" }), durationMs: 4_000 } : { stdout: envelope(modelAnswer()), durationMs: 4_000 }),
    });
    const result = await run(fake);
    expect(result.status).toBe("ok");
    expect(result.stats).toMatchObject({ calls: 2, correctionTurns: 1 });
    const second = fake.calls.filter((c) => c.command === "claude")[1];
    expect(second.input).toContain("CORRECTION");
  });

  it("şemaya uymayan yapılandırılmış çıktı iki kez gelirse invalid_output (başarısız sonuç, çağrılar sayılır)", async () => {
    const bad = { ...modelAnswer(), hookType: "clickbait" };
    const fake = pipelineRunner({ claude: () => ({ stdout: envelope(bad), durationMs: 3_000 }) });
    const result = await run(fake);
    expect(result).toMatchObject({ status: "failed", backend: "claude_frames", failure: { kind: "invalid_output" } });
    expect(result.stats).toMatchObject({ calls: 2, correctionTurns: 1 });
    expect(tempRootEmpty()).toBe(true);
  });

  it("zaman aşımı → claude_timeout; toplam tavan: ilk çağrı tavanı harcadıysa düzeltme turu başlamaz", async () => {
    const timedOut = pipelineRunner({ claude: () => ({ timedOut: true, exitCode: null, durationMs: 180_000 }) });
    await expect(run(timedOut)).resolves.toMatchObject({ status: "failed", failure: { kind: "claude_timeout" } });

    const spent = pipelineRunner({ claude: () => ({ stdout: JSON.stringify({ type: "result", subtype: "success", is_error: false, result: "JSON değil" }), durationMs: 181_000 }) });
    const result = await run(spent);
    expect(result).toMatchObject({ status: "failed", failure: { kind: "claude_timeout" } });
    expect(spent.calls.filter((c) => c.command === "claude")).toHaveLength(1);
  });

  it("Claude yok / kota / çıkış hatası açık hata türleriyle", async () => {
    const missing = pipelineRunner({ claude: () => { throw new SubprocessError("spawn_failed", "ENOENT"); } });
    await expect(run(missing)).resolves.toMatchObject({ failure: { kind: "claude_missing" } });
    const quota = pipelineRunner({ claude: () => ({ exitCode: 1, stderr: "rate limit exceeded (429)" }) });
    await expect(run(quota)).resolves.toMatchObject({ failure: { kind: "claude_quota" } });
    const broken = pipelineRunner({ claude: () => ({ exitCode: 2, stderr: "boom" }) });
    await expect(run(broken)).resolves.toMatchObject({ failure: { kind: "claude_failed" } });
  });

  it("Whisper yok → açık hata (sessiz boş konuşma metni YOK), Claude hiç çağrılmaz, geçici dosyalar silinir", async () => {
    const fake = pipelineRunner({ whisper: { exitCode: 3, stderr: "faster-whisper kurulu değil" } });
    const result = await run(fake);
    expect(result).toMatchObject({ status: "failed", backend: "claude_frames", failure: { kind: "whisper_missing" } });
    expect(fake.calls.some((c) => c.command === "claude")).toBe(false);
    expect(tempRootEmpty()).toBe(true);
  });

  it("kare çıkarılamazsa frames_failed; başarıda da geçici klasör (kareler dahil) silinir", async () => {
    const noFrames = pipelineRunner({ ffmpegExit: 1 });
    await expect(run(noFrames)).resolves.toMatchObject({ failure: { kind: "frames_failed" } });
    expect(tempRootEmpty()).toBe(true);

    await run(pipelineRunner());
    expect(tempRootEmpty()).toBe(true);
  });

  it("sessiz video (Whisper boş, ekran yazısı yok) → insufficient_data; kareler yine de ölçüm verir", async () => {
    const silent = JSON.stringify({ language: "und", text: "", segments: [] });
    const empty = validOutput({ language: "und", transcript: [], hookText: "", hookSource: "caption", hookTypeEvidence: "", sections: [], labels: [] });
    const fake = pipelineRunner({ whisper: { stdout: silent }, claude: () => ({ stdout: envelope(empty) }) });
    const result = await analyzeLocalVideo({ contentId: "c2", isCompetitor: false, durationSec: 9 }, source, { runner: fake.runner, env: {}, now: () => NOW, tempBaseDir: base.dir }, OPTIONS);
    expect(result.status).toBe("insufficient_data");
  });
});

describe("mergeOutput", () => {
  it("modelin speech segmentleri atılır, Whisper'ınkiler girer; sıralı; konuşma yoksa dil modelden", () => {
    const output = validOutput({ transcript: [{ startSec: 1, text: "model uydurdu", channel: "speech" }, { startSec: 2, text: "Ekran yazısı", channel: "screen" }] });
    const merged = mergeOutput(output, { language: "tr", text: "Merhaba", segments: [{ start: 0, end: 1, text: "Merhaba" }] });
    expect(merged.transcript.map((s) => `${s.channel}:${s.text}`)).toEqual(["speech:Merhaba", "screen:Ekran yazısı"]);
    expect(merged.language).toBe("tr");
    const silent = mergeOutput({ ...output, language: "en" }, { language: "und", text: "", segments: [] });
    expect(silent.language).toBe("en");
  });
});

describe("createVideoAnalyzer({ VIDEO_ANALYSIS_BACKEND: claude_frames })", () => {
  it("claude_frames analizörü kurulur; varsayılan hâlâ agy", () => {
    const analyzer = createVideoAnalyzer({ env: { VIDEO_ANALYSIS_BACKEND: "claude_frames" }, runner: createFakeSubprocess().runner });
    expect(analyzer).toMatchObject({ backend: "claude_frames", model: "sonnet" });
    expect(createVideoAnalyzer({ env: {}, runner: createFakeSubprocess().runner }).backend).toBe("agy");
  });

  it("checkAvailable: claude + ffmpeg + Whisper hazırsa true; eksik olanı söyler", async () => {
    const ready = createFakeSubprocess({ stdout: "2.1.300 (Claude Code)\n" });
    await expect(checkClaudeFramesAvailable({ runner: ready.runner, env: {} })).resolves.toEqual({ available: true, version: "2.1.300 (Claude Code)" });

    const noWhisper = createFakeSubprocess((o) => (o.command === "python3" ? { exitCode: 1 } : { stdout: "x" }));
    const missingWhisper = await checkClaudeFramesAvailable({ runner: noWhisper.runner, env: {} });
    expect(missingWhisper.available).toBe(false);
    expect(missingWhisper.reason).toContain("faster-whisper");

    const noFfmpeg = createFakeSubprocess((o) => {
      if (o.command === "ffmpeg") throw new SubprocessError("spawn_failed", "ENOENT");
      return { stdout: "x" };
    });
    expect((await checkClaudeFramesAvailable({ runner: noFfmpeg.runner, env: {} })).reason).toContain("ffmpeg");

    const noClaude = createFakeSubprocess((o) => {
      if (o.command === "claude") throw new SubprocessError("spawn_failed", "ENOENT");
      return {};
    });
    expect((await checkClaudeFramesAvailable({ runner: noClaude.runner, env: {} })).reason).toContain("Claude CLI");
  });
});
