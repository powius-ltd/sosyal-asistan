/**
 * Video analizi motoru — dışa açılan yüzey (`lib/intel` bunu kullanır; bileşenler import ETMEZ). DB'ye yazmaz: kalıcı yazma ve
 * `collection_runs` (subscription) kaydı çağıranın işidir. Ayrıntı: `analyze-video.ts`, sonuç sözleşmesi: `types.ts`.
 */
import "server-only";

export { analyzeVideo, analyzeVideoFile, resolveDeps } from "@/lib/video-analysis/analyze-video";
export { analyzeClaudeFramesFile, checkClaudeFramesAvailable, readClaudeFramesConfig, DEFAULT_CLAUDE_FRAMES_MODEL } from "@/lib/video-analysis/claude-frames";
export { createVideoAnalyzer, resolveBackend } from "@/lib/video-analysis/backend";
export { checkAgyAvailable, readAgyConfig, DEFAULT_AGY_MODEL, type AgyConfig, type CallStats } from "@/lib/video-analysis/agy-client";
export { downloadVideo, DEFAULT_MAX_DOWNLOAD_BYTES } from "@/lib/video-analysis/download";
export { isAllowedCdnHost, ALLOWED_CDN_DOMAINS } from "@/lib/video-analysis/download-url";
export { VideoAnalysisError, isVideoAnalysisError, type VideoAnalysisErrorKind } from "@/lib/video-analysis/errors";
export { PROMPT_VERSION } from "@/lib/video-analysis/prompt";
export { sweepStaleTempDirs, withTempDir } from "@/lib/video-analysis/temp-dir";
export { SHRINK_THRESHOLD_BYTES } from "@/lib/video-analysis/transcode";
export { TRANSCRIPT_RETENTION_DAYS } from "@/lib/video-analysis/types";
export type {
  AnalysisFields,
  AnalyzedTranscript,
  AnalyzeVideoDeps,
  AnalyzeVideoInput,
  BackendAvailability,
  FailedAnalysisResult,
  InsufficientAnalysisResult,
  OkAnalysisResult,
  PersistedSegment,
  VideoAnalysisResult,
  VideoAnalyzer,
} from "@/lib/video-analysis/types";
