/**
 * Ana giriş: `analyzeVideo(input, deps)` — bir videoyu baştan sona analiz eder ve DB'ye YAZMADAN kalıcı yazılacak sonucu döndürür.
 *
 *   temp klasör → indir (yalnız Instagram CDN) → gerekirse 480p'ye küçült → agy (+1 düzeltme turu) → zod → kanıt denetimi → sil
 *
 * Klasör `withTempDir`'in `finally`'sinde silinir: hata, zaman aşımı, geçersiz model çıktısı — video diskte kalmaz. Bu fonksiyon
 * fırlatmaz: her hata `failed` sonucuna çevrilir (`failure.kind` makinece okunur; ileti adres içermez) ve o ana kadarki çağrı
 * istatistiği (`stats`) sonuçta kalır. Bütün dış bağımlılıklar (`now`, `fetch`, `runner`, `sleep`, `env`) enjekte edilir.
 */
import "server-only";

import { z } from "zod";

import { TAXONOMY_VERSION } from "@/lib/domain/intel";
import { formatZodIssues } from "@/lib/llm/json-extract";
import { runSubprocess } from "@/lib/llm/subprocess";
import { analyzeWithAgy } from "@/lib/video-analysis/agy-analysis";
import { emptyStats, readAgyConfig, type CallStats } from "@/lib/video-analysis/agy-client";
import { downloadVideo } from "@/lib/video-analysis/download";
import { describeUnexpected, isVideoAnalysisError, type VideoAnalysisErrorKind } from "@/lib/video-analysis/errors";
import { finalizeAnalysis } from "@/lib/video-analysis/finalize";
import { PROMPT_VERSION } from "@/lib/video-analysis/prompt";
import { withTempDir } from "@/lib/video-analysis/temp-dir";
import { shrinkVideoIfNeeded } from "@/lib/video-analysis/transcode";
import type {
  BackendIdentity,
  PipelineOptions,
  AnalyzeVideoDeps,
  AnalyzeVideoInput,
  FailedAnalysisResult,
  InsufficientAnalysisResult,
  OkAnalysisResult,
  VideoAnalysisResult,
} from "@/lib/video-analysis/types";

const inputSchema = z.object({
  contentId: z.string().trim().min(1),
  videoUrl: z.string().trim().min(1),
  isCompetitor: z.boolean(),
  caption: z.string().optional(),
  durationSec: z.number().positive().finite().optional(),
});

/** Verilmeyen bağımlılıkları gerçekleriyle doldurur (`process.env` YALNIZ burada okunur). */
export function resolveDeps(partial: Partial<AnalyzeVideoDeps> = {}): AnalyzeVideoDeps {
  return {
    now: partial.now ?? (() => new Date()),
    fetch: partial.fetch ?? fetch,
    runner: partial.runner ?? runSubprocess,
    sleep: partial.sleep ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms))),
    env: partial.env ?? process.env,
    tempBaseDir: partial.tempBaseDir,
    limits: partial.limits,
  };
}

export interface LocalVideoFile {
  /** Videoyu içeren izole klasör (cwd). */
  dir: string;
  fileName: string;
}

/**
 * İndirme sonrası adımlar: agy + doğrulama + kanıt denetimi. Hata fırlatabilir (`VideoAnalysisError`). Yerel bir dosyayla
 * (indirmesiz) çalıştırmak isteyen araçlar/testler için ayrı dışa açıktır.
 */
export async function analyzeVideoFile(
  input: Omit<AnalyzeVideoInput, "videoUrl">,
  file: LocalVideoFile,
  deps: AnalyzeVideoDeps,
  stats: CallStats,
): Promise<OkAnalysisResult | InsufficientAnalysisResult> {
  const config = readAgyConfig(deps.env);
  const output = await analyzeWithAgy(
    { dir: file.dir, fileName: file.fileName, caption: input.caption, durationSec: input.durationSec },
    { runner: deps.runner, sleep: deps.sleep, config },
    stats,
  );
  return finalizeAnalysis({
    contentId: input.contentId,
    isCompetitor: input.isCompetitor,
    caption: input.caption,
    durationSec: input.durationSec,
    output,
    now: deps.now(),
    model: config.model,
    stats,
  });
}

export function failedResult(
  deps: AnalyzeVideoDeps,
  contentId: string,
  durationSec: number | undefined,
  stats: CallStats,
  kind: VideoAnalysisErrorKind,
  message: string,
  identity?: BackendIdentity,
): FailedAnalysisResult {
  return {
    status: "failed",
    contentId,
    backend: identity?.backend ?? "agy",
    model: identity?.model ?? readAgyConfig(deps.env).model,
    taxonomyVersion: TAXONOMY_VERSION,
    promptVersion: PROMPT_VERSION,
    ...(durationSec === undefined ? {} : { durationSec }),
    stats,
    failure: { kind, message },
    evidenceVerified: false,
  };
}

export async function analyzeVideo(
  input: AnalyzeVideoInput,
  partialDeps: Partial<AnalyzeVideoDeps> = {},
  options: PipelineOptions = {},
): Promise<VideoAnalysisResult> {
  const deps = resolveDeps(partialDeps);
  const stats = emptyStats();
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    const contentId = typeof input?.contentId === "string" ? input.contentId : "";
    return failedResult(deps, contentId, undefined, stats, "invalid_input", `Girdi geçersiz: ${formatZodIssues(parsed.error, 3).replace(/\s+/g, " ")}`, options.identity);
  }
  const { limits } = deps;
  const analyzeFile = options.analyzeFile ?? analyzeVideoFile;

  try {
    return await withTempDir(
      async (dir) => {
        const downloaded = await downloadVideo(parsed.data.videoUrl, {
          dir,
          fetch: deps.fetch,
          now: deps.now,
          maxBytes: limits?.maxDownloadBytes,
          timeoutMs: limits?.downloadTimeoutMs,
        });
        const file =
          options.shrink === false
            ? { fileName: downloaded.fileName }
            : await shrinkVideoIfNeeded(
                { fileName: downloaded.fileName, bytes: downloaded.bytes },
                { dir, runner: deps.runner, env: deps.env, thresholdBytes: limits?.shrinkThresholdBytes },
              );
        return analyzeFile(parsed.data, { dir, fileName: file.fileName }, deps, stats);
      },
      { baseDir: deps.tempBaseDir },
    );
  } catch (error) {
    const { contentId, durationSec } = parsed.data;
    if (isVideoAnalysisError(error)) return failedResult(deps, contentId, durationSec, stats, error.kind, error.message, options.identity);
    return failedResult(deps, contentId, durationSec, stats, "internal", `Beklenmeyen hata: ${describeUnexpected(error)}`, options.identity);
  }
}
