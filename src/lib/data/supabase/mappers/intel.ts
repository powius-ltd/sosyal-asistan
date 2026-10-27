/**
 * Zeka katmanı satırları → domain: transcript, içerik analizi. jsonb alanları (`sections`, `labels`) zod ile doğrulanır;
 * biçimsiz öğe atılır (kanıtsız etiket gösterilmez). `Transcript.source` ← `transcripts.provider` (`openai` ↔ `openai_stt`).
 */
import { z } from "zod";

import type { AnalysisLabel, AnalysisSection, ContentAnalysis, EditMetrics, EvidenceReport, Transcript, TranscriptSegment } from "@/lib/domain/intel";
import type { Json, Tables } from "@/lib/supabase/database.types";
import { EDIT_METRIC_FIELDS, EVIDENCE_REPORT_SCHEMA } from "@/lib/data/analysis-schema";
import { iso, isoOpt, opt, validEntries } from "@/lib/data/supabase/mappers/common";
import { analysisBackendOf, analysisStatusOf, hookSourceOf, transcriptSourceOf } from "@/lib/data/supabase/mappers/enums";

export const TRANSCRIPT_COLUMNS = "id, content_item_id, provider, language, text, segments, word_count, is_meaningful, expires_at, created_at" as const;
export type TranscriptRow = Pick<
  Tables<"transcripts">,
  "id" | "content_item_id" | "provider" | "language" | "text" | "segments" | "word_count" | "is_meaningful" | "expires_at" | "created_at"
>;

/** `transcripts.segments` öğesi: `channel` yoksa konuşma sayılır (eski satırlar; bkz. 0007 açıklaması). */
const segmentSchema = z.object({
  start: z.number().nonnegative(),
  end: z.number().nonnegative().nullish(),
  text: z.string(),
  channel: z.enum(["speech", "screen"]).default("speech"),
});

/** Geçerli, metni dolu parçalar (bozuk öğe atılır); hiçbiri yoksa undefined (segmentsiz/eski transcript). */
function toSegments(value: Json | null): TranscriptSegment[] | undefined {
  const segments = validEntries(value, segmentSchema).flatMap((s): TranscriptSegment[] =>
    s.text.trim() === "" ? [] : [{ startSec: s.start, ...(s.end == null ? {} : { endSec: s.end }), text: s.text.trim(), channel: s.channel }],
  );
  return segments.length === 0 ? undefined : segments;
}

export function toTranscript(row: TranscriptRow): Transcript {
  return {
    id: row.id,
    contentItemId: row.content_item_id,
    language: opt(row.language),
    // Süresi dolan transcript'te metin silinir (`text` NULL) ama satır kalır: UI "süresi doldu" gösterir.
    text: opt(row.text),
    // Süre dolunca `segments` de silinir (0003); rakip ekran yazısı da transcript gibi 90 gün sonra kalmaz.
    segments: row.text === null ? undefined : toSegments(row.segments),
    wordCount: row.word_count,
    isMeaningful: row.is_meaningful,
    source: transcriptSourceOf(row.provider),
    expiresAt: isoOpt(row.expires_at),
    createdAt: iso(row.created_at),
  };
}

const sectionSchema = z.object({ type: z.string(), quote: z.string(), startSec: z.number().optional() });
const labelSchema = z.object({ key: z.string(), value: z.string(), evidence: z.string() });

export const ANALYSIS_COLUMNS =
  "id, content_item_id, status, failure_reason, hook_text, hook_source, hook_type, hook_type_evidence, sections, labels, edit_metrics, evidence_verified, evidence_report, taxonomy_version, prompt_version, model, backend, run_id, created_at" as const;
export type AnalysisRow = Pick<
  Tables<"content_analyses">,
  | "id"
  | "content_item_id"
  | "status"
  | "failure_reason"
  | "hook_text"
  | "hook_source"
  | "hook_type"
  | "hook_type_evidence"
  | "sections"
  | "labels"
  | "edit_metrics"
  | "evidence_verified"
  | "evidence_report"
  | "taxonomy_version"
  | "prompt_version"
  | "model"
  | "backend"
  | "run_id"
  | "created_at"
>;

/** `edit_metrics` (jsonb) → `EditMetrics`; alanlar tek tek doğrulanır (bozuk alan atılır), hiç alan kalmadıysa undefined (0 değil). */
export function toEditMetrics(value: Json | null | undefined): EditMetrics | undefined {
  if (value === null || value === undefined || typeof value !== "object" || Array.isArray(value)) return undefined;
  const raw = value as Record<string, Json | undefined>;
  const out: Record<string, unknown> = {};
  for (const [key, schema] of Object.entries(EDIT_METRIC_FIELDS)) {
    const parsed = schema.safeParse(raw[key]);
    if (parsed.success) out[key] = parsed.data;
  }
  return Object.keys(out).length > 0 ? (out as EditMetrics) : undefined;
}

/** `evidence_report` (jsonb) → `EvidenceReport`; biçimsizse undefined (rapor yok sayılır, analiz kalır). */
export function toEvidenceReport(value: Json | null | undefined): EvidenceReport | undefined {
  const parsed = EVIDENCE_REPORT_SCHEMA.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

export function toContentAnalysis(row: AnalysisRow): ContentAnalysis {
  return {
    id: row.id,
    contentItemId: row.content_item_id,
    status: analysisStatusOf(row.status),
    failureReason: opt(row.failure_reason),
    hookText: opt(row.hook_text),
    hookSource: row.hook_source === null ? undefined : hookSourceOf(row.hook_source),
    hookType: opt(row.hook_type),
    hookTypeEvidence: opt(row.hook_type_evidence),
    sections: validEntries<AnalysisSection>(row.sections, sectionSchema),
    labels: validEntries<AnalysisLabel>(row.labels, labelSchema),
    editMetrics: toEditMetrics(row.edit_metrics),
    evidenceVerified: row.evidence_verified,
    evidenceReport: toEvidenceReport(row.evidence_report),
    taxonomyVersion: row.taxonomy_version,
    promptVersion: row.prompt_version,
    model: opt(row.model),
    backend: row.backend === null ? undefined : analysisBackendOf(row.backend),
    runId: opt(row.run_id),
    createdAt: iso(row.created_at),
  };
}
