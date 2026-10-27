/**
 * Model çıktısı → kalıcı yazılacak sonuç (saf; ağ/CLI/DB yok):
 *  1. Transcript kanallara ayrılır: konuşma metni (`text`, `isMeaningful`) ve ekran yazısı (yalnız `segments`'te).
 *  2. Kanıt denetimi SUNUCUDA: `verifyEvidence` korpusta (konuşma ∪ ekran yazısı ∪ açıklama) her alıntıyı arar. Not: aynı model
 *     transkripti ve alıntıyı ürettiği için bu bir ÖZ-TUTARLILIK denetimidir, bağımsız doğrulama değil.
 *  3. Konuşma + ekran yazısı < 8 kelime → `insufficient_data` (metinden türeyen alanlar boş; görsel ölçümler korunur).
 *  4. Kurgu türevleri (`avgShotSec`, `cutsPerMinute`) KODDA hesaplanır; süre bilinmiyorsa yazılmaz (`undefined ≠ 0`).
 *  2a. Kanıtı alıntılanamayan etiket (tek kelime, hashtag, kullanıcı adı) DÜŞÜRÜLÜR: istem "böyle etiket verme" der, model
 *      yine verirse tek etiket yüzünden bütün video "doğrulanmadı" sayılmasın. Kanca ve bölüm alıntıları düşürülmez.
 *  5. Rakip transcript'i `expiresAt` = şimdi + 90 gün; kendi içerikte süresiz.
 * `evidenceVerified` yalnız `status === "ok"` iken true olabilir.
 */
import "server-only";

import { EDIT_METRICS_SCHEMA } from "@/lib/data/analysis-schema";
import { MIN_MEANINGFUL_WORDS, TAXONOMY_VERSION, type AnalysisBackend, type EditMetrics } from "@/lib/domain/intel";
import { isMeaningfulSpeech, MIN_QUOTE_WORDS, verifyEvidence } from "@/lib/intel/evidence";
import { countWords } from "@/lib/intel/normalize";
import { DAY_MS } from "@/lib/time";
import type { CallStats } from "@/lib/video-analysis/agy-client";
import type { VideoAnalysisOutput } from "@/lib/video-analysis/output-schema";
import { PROMPT_VERSION } from "@/lib/video-analysis/prompt";
import {
  TRANSCRIPT_RETENTION_DAYS,
  type AnalysisFields,
  type AnalyzedTranscript,
  type InsufficientAnalysisResult,
  type OkAnalysisResult,
  type PersistedSegment,
} from "@/lib/video-analysis/types";

export interface FinalizeInput {
  contentId: string;
  isCompetitor: boolean;
  caption?: string;
  /** Bilinen süre (sn); yoksa modelin bildirdiği süre. */
  durationSec?: number;
  output: VideoAnalysisOutput;
  now: Date;
  model: string;
  stats: CallStats;
  /** Varsayılan `agy`. */
  backend?: AnalysisBackend;
  /** Varsayılan agy istem sürümü (`PROMPT_VERSION`). */
  promptVersion?: string;
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

/** Modelin gözlemlediği ölçümlere süre-türevlerini ekler; hiç ölçüm yoksa undefined. */
export function deriveEditMetrics(measured: VideoAnalysisOutput["editMetrics"], durationSec: number | undefined): EditMetrics | undefined {
  const metrics: EditMetrics = { ...measured };
  if (metrics.cutCount !== undefined) metrics.cutCount = Math.round(metrics.cutCount);
  if (metrics.cutCount !== undefined && durationSec !== undefined && Number.isFinite(durationSec) && durationSec > 0) {
    metrics.cutsPerMinute = round2(metrics.cutCount / (durationSec / 60));
    metrics.avgShotSec = round2(durationSec / (metrics.cutCount + 1));
  }
  if (Object.keys(metrics).length === 0) return undefined;
  return EDIT_METRICS_SCHEMA.parse(metrics);
}

function joinChannel(output: VideoAnalysisOutput, channel: "speech" | "screen"): string {
  return output.transcript
    .filter((segment) => segment.channel === channel)
    .map((segment) => segment.text)
    .join(" ");
}

function persistedSegments(output: VideoAnalysisOutput): PersistedSegment[] {
  return output.transcript.map((segment) => ({
    start: segment.startSec,
    ...(segment.endSec === undefined ? {} : { end: segment.endSec }),
    text: segment.text,
    channel: segment.channel,
  }));
}

/** Etiket kanıtı alıntılanabilir mi: en az `MIN_QUOTE_WORDS` kelime ve tek bir #etiket / @ad değil. */
export function isQuotableLabel(label: VideoAnalysisOutput["labels"][number]): boolean {
  const evidence = label.evidence.trim();
  if (/^[#@]\S+$/u.test(evidence)) return false;
  return countWords(evidence) >= MIN_QUOTE_WORDS;
}

export function finalizeAnalysis(input: FinalizeInput): OkAnalysisResult | InsufficientAnalysisResult {
  const { output } = input;
  const backend = input.backend ?? "agy";
  const durationSec = input.durationSec ?? output.durationSec;
  const speechText = joinChannel(output, "speech");
  const screenText = joinChannel(output, "screen");

  const hookText = output.hookText.trim();
  const labels = output.labels.filter(isQuotableLabel);
  const evidenceReport = verifyEvidence(
    { speech: speechText, screenText, caption: input.caption },
    {
      hook: hookText === "" ? undefined : { text: hookText, source: output.hookSource },
      hookTypeEvidence: output.hookTypeEvidence,
      sections: output.sections,
      labels,
    },
  );

  const transcript: AnalyzedTranscript = {
    provider: backend === "claude_frames" ? "claude_cli" : "gemini",
    language: output.language,
    text: speechText,
    wordCount: countWords(speechText),
    segments: persistedSegments(output),
    isMeaningful: isMeaningfulSpeech(speechText),
    ...(input.isCompetitor ? { expiresAt: new Date(input.now.getTime() + TRANSCRIPT_RETENTION_DAYS * DAY_MS).toISOString() } : {}),
  };

  const base = {
    contentId: input.contentId,
    backend,
    model: input.model,
    taxonomyVersion: TAXONOMY_VERSION,
    promptVersion: input.promptVersion ?? PROMPT_VERSION,
    ...(durationSec === undefined ? {} : { durationSec }),
    stats: input.stats,
    transcript,
  };
  const editMetrics = deriveEditMetrics(output.editMetrics, durationSec);

  if (evidenceReport.insufficientData) {
    const analysis: AnalysisFields = { sections: [], labels: [], ...(editMetrics ? { editMetrics } : {}), evidenceReport };
    return {
      ...base,
      status: "insufficient_data",
      reason: `Konuşma ve ekran yazısı toplam ${evidenceReport.corpusWords} kelime; en az ${MIN_MEANINGFUL_WORDS} kelime gerekir (müzik/sessiz video).`,
      analysis,
      evidenceVerified: false,
    };
  }

  const analysis: AnalysisFields = {
    ...(hookText === "" ? {} : { hookText, hookSource: output.hookSource }),
    hookType: output.hookType,
    ...(output.hookTypeEvidence === "" ? {} : { hookTypeEvidence: output.hookTypeEvidence }),
    sections: output.sections.map((section) => ({ type: section.type, quote: section.quote, startSec: section.startSec })),
    labels: labels.map((label) => ({ key: label.key, value: label.value, evidence: label.evidence })),
    ...(editMetrics ? { editMetrics } : {}),
    evidenceReport,
  };
  return { ...base, status: "ok", analysis, evidenceVerified: evidenceReport.verified };
}
