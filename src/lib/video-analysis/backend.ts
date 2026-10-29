/**
 * Arka uç seçimi: `VIDEO_ANALYSIS_BACKEND=agy|gemini-api|claude_frames` (boş/yok = `agy`).
 *  - `agy`: lokal Antigravity CLI, abonelik (yalnız kendi testlerimiz; `collection_runs.billing = 'subscription'`).
 *  - `claude_frames`: Google hesabı olmayan müşteri için: ffmpeg kareleri + yerel Whisper konuşma metni → Claude CLI (müşterinin aboneliği).
 *  - `gemini-api`: deploy/müşteri işi için ÜCRETLİ Gemini API. Henüz yazılmadı: `analyze` `not_implemented` fırlatır
 *    (sessizce `agy`ye düşülmez: müşteri verisi kişisel aboneliğe gitmesin).
 */
import "server-only";

import { ANALYSIS_BACKENDS, type AnalysisBackend } from "@/lib/domain/intel";
import { analyzeLocalVideo } from "@/lib/video-analysis/analyze-local";
import { analyzeVideo, resolveDeps } from "@/lib/video-analysis/analyze-video";
import { checkAgyAvailable, readAgyConfig } from "@/lib/video-analysis/agy-client";
import { analyzeClaudeFramesFile, checkClaudeFramesAvailable, readClaudeFramesConfig } from "@/lib/video-analysis/claude-frames";
import { envString, type Env } from "@/lib/video-analysis/env";
import { VideoAnalysisError } from "@/lib/video-analysis/errors";
import type { AnalyzeVideoDeps, VideoAnalyzer } from "@/lib/video-analysis/types";

export function resolveBackend(env: Env): AnalysisBackend {
  const raw = envString(env, "VIDEO_ANALYSIS_BACKEND") ?? "agy";
  const match = ANALYSIS_BACKENDS.find((backend) => backend === raw);
  if (!match) throw new VideoAnalysisError("invalid_input", `VIDEO_ANALYSIS_BACKEND geçersiz: "${raw}" (agy | gemini-api).`);
  return match;
}

function createAgyAnalyzer(deps: AnalyzeVideoDeps): VideoAnalyzer {
  const config = readAgyConfig(deps.env);
  return {
    backend: "agy",
    model: config.model,
    checkAvailable: () => checkAgyAvailable({ runner: deps.runner, config }),
    analyze: (input) => analyzeVideo(input, deps),
    analyzeLocal: (input, sourcePath) => analyzeLocalVideo(input, sourcePath, deps),
  };
}

function createClaudeFramesAnalyzer(deps: AnalyzeVideoDeps): VideoAnalyzer {
  const config = readClaudeFramesConfig(deps.env);
  const options = { identity: { backend: "claude_frames", model: config.model }, analyzeFile: analyzeClaudeFramesFile, shrink: false } as const;
  return {
    backend: "claude_frames",
    model: config.model,
    checkAvailable: () => checkClaudeFramesAvailable(deps),
    analyze: (input) => analyzeVideo(input, deps, options),
    analyzeLocal: (input, sourcePath) => analyzeLocalVideo(input, sourcePath, deps, options),
  };
}

const GEMINI_API_NOT_IMPLEMENTED = "gemini-api arka ucu henüz yazılmadı (müşteri/deploy işi için sonra); yerelde VIDEO_ANALYSIS_BACKEND=agy kullanın.";

function createGeminiApiAnalyzer(): VideoAnalyzer {
  return {
    backend: "gemini-api",
    model: "gemini-api",
    checkAvailable: () => Promise.resolve({ available: false, reason: GEMINI_API_NOT_IMPLEMENTED }),
    analyze: () => Promise.reject(new VideoAnalysisError("not_implemented", GEMINI_API_NOT_IMPLEMENTED)),
  };
}

/** Ortamdaki `VIDEO_ANALYSIS_BACKEND`'e göre analizörü kurar (geçersiz değer → `invalid_input` fırlatır). */
export function createVideoAnalyzer(partialDeps: Partial<AnalyzeVideoDeps> = {}): VideoAnalyzer {
  const deps = resolveDeps(partialDeps);
  const backend = resolveBackend(deps.env);
  if (backend === "gemini-api") return createGeminiApiAnalyzer();
  return backend === "claude_frames" ? createClaudeFramesAnalyzer(deps) : createAgyAnalyzer(deps);
}
