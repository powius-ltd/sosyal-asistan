/**
 * Yerel konuşma metni: `tools/transcribe.py` (faster-whisper, CPU) `runSubprocess` ile çağrılır; stdout'taki JSON zod ile doğrulanır.
 * `claude_frames` arka ucu videoyu DİNLEYEMEZ, konuşma metni buradan gelir. Sessiz boş metin YOK: Whisper kurulu değilse, zaman
 * aşarsa ya da bozuk çıktı verirse açık hata kodu (`whisper_missing` | `whisper_timeout` | `whisper_failed`) fırlatılır. Sessiz ya da
 * ses akışsız video hata DEĞİLDİR (boş metin + `und`).
 * Ortam: `WHISPER_PYTHON` (varsayılan `python3`), `WHISPER_SCRIPT` (varsayılan `<cwd>/tools/transcribe.py`), `WHISPER_MODEL` (small),
 * `WHISPER_LANGUAGE` (boş = otomatik), `WHISPER_TIMEOUT_MS`.
 */
import "server-only";

import path from "node:path";

import { z } from "zod";

import { formatZodIssues } from "@/lib/llm/json-extract";
import { SubprocessError, type SubprocessRunner } from "@/lib/llm/subprocess";
import { envPositiveInt, envString, type Env } from "@/lib/video-analysis/env";
import { VideoAnalysisError } from "@/lib/video-analysis/errors";
import { LANGUAGE_PATTERN } from "@/lib/video-analysis/output-schema";

/** İlk çalıştırmada model indirilir (small ≈ 480 MB): pay geniş. */
export const DEFAULT_WHISPER_TIMEOUT_MS = 300_000;
const MAX_SEGMENTS = 400;
const MISSING_EXIT_CODE = 3;

const whisperOutputSchema = z.object({
  language: z.string().trim().regex(LANGUAGE_PATTERN),
  text: z.string(),
  segments: z.array(z.object({ start: z.number().nonnegative().finite(), end: z.number().nonnegative().finite(), text: z.string().trim().min(1) })),
});

/**
 * Whisper'ın boşlukta / müzikte uydurduğu bilinen sanrılar (normalize: küçük harf, noktalamasız). Bunlardan BAŞKA metin
 * içermeyen konuşma boş sayılır. `tools/transcribe.py` `HALLUCINATIONS` kopyası bununla birlikte güncellenir.
 */
export const WHISPER_HALLUCINATIONS: readonly string[] = ["you", "thank you", "thanks", "thanks for watching", "thank you for watching", "bye", "okay"];

function normalizeSpeech(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function isOnlyHallucination(segments: readonly WhisperSegment[]): boolean {
  return segments.length > 0 && segments.every((segment) => WHISPER_HALLUCINATIONS.includes(normalizeSpeech(segment.text)));
}

export interface WhisperSegment {
  start: number;
  end: number;
  text: string;
}

export interface WhisperResult {
  language: string;
  text: string;
  segments: WhisperSegment[];
}

export interface WhisperConfig {
  python: string;
  script: string;
  model?: string;
  language?: string;
  timeoutMs: number;
}

export function readWhisperConfig(env: Env): WhisperConfig {
  return {
    python: envString(env, "WHISPER_PYTHON") ?? "python3",
    script: envString(env, "WHISPER_SCRIPT") ?? path.join(process.cwd(), "tools", "transcribe.py"),
    model: envString(env, "WHISPER_MODEL"),
    language: envString(env, "WHISPER_LANGUAGE"),
    timeoutMs: envPositiveInt(env, "WHISPER_TIMEOUT_MS", DEFAULT_WHISPER_TIMEOUT_MS),
  };
}

const MISSING_HINT = "Whisper bulunamadı: faster-whisper kurun ve WHISPER_PYTHON ile python yolunu verin (tools/transcribe.py).";

/** Whisper'ın çalıştığını (python + faster-whisper) model indirmeden doğrular. */
export async function checkWhisperAvailable(runner: SubprocessRunner, config: WhisperConfig): Promise<{ available: boolean; reason?: string }> {
  try {
    const result = await runner({ command: config.python, args: ["-c", "import faster_whisper"], timeoutMs: 30_000 });
    return result.exitCode === 0 ? { available: true } : { available: false, reason: MISSING_HINT };
  } catch (error) {
    if (error instanceof SubprocessError && error.code === "spawn_failed") return { available: false, reason: MISSING_HINT };
    return { available: false, reason: error instanceof Error ? error.message : MISSING_HINT };
  }
}

/** Dosyadaki konuşmayı çözer. Hata → `VideoAnalysisError` (whisper_*). */
export async function transcribeFile(filePath: string, deps: { runner: SubprocessRunner; env: Env; cwd?: string }): Promise<WhisperResult> {
  const config = readWhisperConfig(deps.env);
  let result;
  try {
    result = await deps.runner({
      command: config.python,
      args: [config.script, filePath],
      timeoutMs: config.timeoutMs,
      cwd: deps.cwd,
      env: { WHISPER_MODEL: config.model, WHISPER_LANGUAGE: config.language },
    });
  } catch (error) {
    if (error instanceof SubprocessError && error.code === "spawn_failed") throw new VideoAnalysisError("whisper_missing", MISSING_HINT);
    throw error;
  }
  if (result.timedOut) throw new VideoAnalysisError("whisper_timeout", `Whisper zaman aşımı (${Math.round(result.durationMs / 1000)} sn).`);
  if (result.exitCode === MISSING_EXIT_CODE) throw new VideoAnalysisError("whisper_missing", MISSING_HINT);
  if (result.exitCode !== 0 || result.truncatedStdout) {
    const detail = result.stderr.trim().split(/\r?\n/).slice(-1)[0]?.slice(0, 200) ?? "";
    throw new VideoAnalysisError("whisper_failed", `Whisper çıkış kodu ${result.exitCode ?? "yok"}${detail ? ` — ${detail}` : ""}`);
  }

  let json: unknown;
  try {
    json = JSON.parse(result.stdout);
  } catch {
    throw new VideoAnalysisError("whisper_failed", "Whisper çıktısı JSON değil.");
  }
  const parsed = whisperOutputSchema.safeParse(json);
  if (!parsed.success) throw new VideoAnalysisError("whisper_failed", `Whisper çıktısı beklenen biçimde değil: ${formatZodIssues(parsed.error, 3).replace(/\s+/g, " ")}`);
  const segments = parsed.data.segments.slice(0, MAX_SEGMENTS);
  if (isOnlyHallucination(segments)) return { language: parsed.data.language, text: "", segments: [] };
  return { language: parsed.data.language, text: segments.map((segment) => segment.text).join(" "), segments };
}
