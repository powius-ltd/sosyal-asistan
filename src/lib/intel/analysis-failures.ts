/**
 * Model çağrılmadan başarısız olan analizler (adres süresi dolmuş / bulunamadı): `failed` sonucu üretilir ve yazılır; sonraki koşuda
 * yeniden denenir (seçim `failed`'i atlamaz). Çağrı istatistiği boştur (agy çağrısı yapılmadı, sayaca/koşu kaydına girmez).
 */
import "server-only";

import { TAXONOMY_VERSION, type AnalysisBackend } from "@/lib/domain/intel";
import { emptyStats } from "@/lib/video-analysis/agy-client";
import type { VideoAnalysisErrorKind } from "@/lib/video-analysis/errors";
import { PROMPT_VERSION } from "@/lib/video-analysis/prompt";
import type { FailedAnalysisResult } from "@/lib/video-analysis/types";

export const EXPIRED_MESSAGE = "Video adresinin süresi dolmuş; yeni adres için collect:now gerekir.";
export const MISSING_MESSAGE = "Video adresi son toplama koşularında bulunamadı; collect:now gerekir.";

export function unanalyzedResult(contentId: string, kind: Extract<VideoAnalysisErrorKind, "expired_url" | "invalid_url">, model: string, backend: AnalysisBackend = "agy"): FailedAnalysisResult {
  return {
    status: "failed",
    contentId,
    backend,
    model,
    taxonomyVersion: TAXONOMY_VERSION,
    promptVersion: PROMPT_VERSION,
    stats: emptyStats(),
    failure: { kind, message: kind === "expired_url" ? EXPIRED_MESSAGE : MISSING_MESSAGE },
    evidenceVerified: false,
  };
}
