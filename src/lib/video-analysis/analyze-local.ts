/**
 * Yerel dosya analizi (operatör aracı): dosya geçici klasöre KOPYALANIR (kaynak klasöre dokunulmaz), gerekirse küçültülür, `agy` ile
 * analiz edilir, klasör `finally`'de silinir. İndirme yoktur; `analyzeVideo` ile aynı hata eşlemesi (fırlatmaz, `failed` döner).
 */
import "server-only";

import { copyFile, stat } from "node:fs/promises";
import path from "node:path";

import { analyzeVideoFile, failedResult, resolveDeps } from "@/lib/video-analysis/analyze-video";
import { emptyStats } from "@/lib/video-analysis/agy-client";
import { describeUnexpected, isVideoAnalysisError } from "@/lib/video-analysis/errors";
import { withTempDir } from "@/lib/video-analysis/temp-dir";
import { shrinkVideoIfNeeded } from "@/lib/video-analysis/transcode";
import type { AnalyzeVideoDeps, AnalyzeVideoInput, PipelineOptions, VideoAnalysisResult } from "@/lib/video-analysis/types";

export async function analyzeLocalVideo(
  input: Omit<AnalyzeVideoInput, "videoUrl">,
  sourcePath: string,
  partialDeps: Partial<AnalyzeVideoDeps> = {},
  options: PipelineOptions = {},
): Promise<VideoAnalysisResult> {
  const deps = resolveDeps(partialDeps);
  const stats = emptyStats();
  try {
    return await withTempDir(
      async (dir) => {
        const fileName = "video.mp4";
        await copyFile(sourcePath, path.join(dir, fileName));
        const { size } = await stat(path.join(dir, fileName));
        const file =
          options.shrink === false
            ? { fileName }
            : await shrinkVideoIfNeeded({ fileName, bytes: size }, { dir, runner: deps.runner, env: deps.env, thresholdBytes: deps.limits?.shrinkThresholdBytes });
        return (options.analyzeFile ?? analyzeVideoFile)(input, { dir, fileName: file.fileName }, deps, stats);
      },
      { baseDir: deps.tempBaseDir },
    );
  } catch (error) {
    if (isVideoAnalysisError(error)) return failedResult(deps, input.contentId, input.durationSec, stats, error.kind, error.message, options.identity);
    return failedResult(deps, input.contentId, input.durationSec, stats, "internal", `Beklenmeyen hata: ${describeUnexpected(error)}`, options.identity);
  }
}
