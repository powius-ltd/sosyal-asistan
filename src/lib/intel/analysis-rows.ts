/**
 * Saf eşleme: `VideoAnalysisResult` (lib/video-analysis) → `transcripts` ve `content_analyses` satırları (DB'ye dokunmaz).
 * Kurallar:
 *  - `evidence_verified` YALNIZ `status === 'ok'` iken true olabilir (DB kısıtı `content_analyses_verified_needs_ok` ile aynı).
 *  - Ölçülemeyen alan NULL yazılır, 0 değil (`edit_metrics`/`evidence_report` yoksa NULL; `hook_*` yalnız ok sonuçta).
 *  - Transcript yalnız `ok` ve `insufficient_data` sonuçta vardır; `failed` için satır yazılmaz. Rakipte `expires_at` = +90 gün
 *    (motor doldurur), kendi içerikte NULL. Dil kodu DB biçimine uymazsa NULL.
 *  - `search_key` = foldTurkish(hook + hesap + tür etiketi): hook kütüphanesi araması.
 */
import { EDIT_METRICS_SCHEMA, EVIDENCE_REPORT_SCHEMA } from "@/lib/data/analysis-schema";
import { hookTypeLabel } from "@/lib/domain/hook-types";
import type { Json, TablesInsert } from "@/lib/supabase/database.types";
import { foldTurkish } from "@/lib/text";
import type { AnalyzedTranscript, VideoAnalysisResult } from "@/lib/video-analysis/types";

export type TranscriptRow = TablesInsert<"transcripts">;
export type AnalysisRow = TablesInsert<"content_analyses">;

const LANGUAGE_PATTERN = /^[A-Za-z]{2,3}([-_][A-Za-z0-9]{2,8})*$/;

const asJson = (value: unknown): NonNullable<Json> => value as NonNullable<Json>;

export function toTranscriptRow(transcript: AnalyzedTranscript, ctx: { workspaceId: string; contentId: string }): TranscriptRow {
  return {
    workspace_id: ctx.workspaceId,
    content_item_id: ctx.contentId,
    provider: transcript.provider,
    language: LANGUAGE_PATTERN.test(transcript.language) ? transcript.language : null,
    text: transcript.text,
    segments: asJson(transcript.segments),
    word_count: transcript.wordCount,
    is_meaningful: transcript.isMeaningful,
    expires_at: transcript.expiresAt ?? null,
  };
}

export interface AnalysisRowContext {
  workspaceId: string;
  /** Analizi üreten `collection_runs.id`; analiz denenmeden başarısız olan (adres süresi dolmuş) içerikte yok. */
  runId?: string;
  /** İçeriğin sahibi ("@" yok; arama anahtarı için). */
  ownerHandle: string;
}

export function toAnalysisRow(result: VideoAnalysisResult, ctx: AnalysisRowContext): AnalysisRow {
  const base = {
    workspace_id: ctx.workspaceId,
    content_item_id: result.contentId,
    taxonomy_version: result.taxonomyVersion,
    prompt_version: result.promptVersion,
    model: result.model,
    backend: result.backend,
    run_id: ctx.runId ?? null,
  };
  if (result.status === "failed") {
    return { ...base, status: "failed", failure_reason: result.failure.message, sections: [], labels: [], evidence_verified: false };
  }

  const { analysis } = result;
  const editMetrics = analysis.editMetrics === undefined ? null : asJson(EDIT_METRICS_SCHEMA.parse(analysis.editMetrics));
  const common = {
    ...base,
    edit_metrics: editMetrics,
    evidence_report: asJson(EVIDENCE_REPORT_SCHEMA.parse(analysis.evidenceReport)),
  };
  if (result.status === "insufficient_data") {
    return { ...common, status: "insufficient_data", failure_reason: result.reason, sections: [], labels: [], evidence_verified: false };
  }
  return {
    ...common,
    status: "ok",
    failure_reason: null,
    hook_text: analysis.hookText ?? null,
    hook_source: analysis.hookSource ?? null,
    hook_type: analysis.hookType ?? null,
    hook_type_evidence: analysis.hookTypeEvidence ?? null,
    sections: asJson(analysis.sections),
    labels: asJson(analysis.labels),
    evidence_verified: result.evidenceVerified,
    search_key: foldTurkish([analysis.hookText, ctx.ownerHandle, analysis.hookType === undefined ? undefined : hookTypeLabel(analysis.hookType)].filter(Boolean).join(" ")),
  };
}
