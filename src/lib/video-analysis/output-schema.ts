/**
 * Video analizi ÇIKTI şeması (modelin döndüreceği nesne; zod = tek tanım, JSON Schema buradan türer — `model-json-schema.ts`).
 * Panele özel: konuşma ve ekran yazısı AYRI kanallı transcript, konuşulan ilk cümle hook'u, bölümler, etiketler, kurgu ölçümleri.
 *
 * Enum'lar YALNIZ `lib/llm/taxonomy`'deki zod şemalarından gelir (prompt da aynı listeyi görür); listenin dışında değer → zod reddeder
 * ve sonuç geçersiz sayılır. Alıntı alanları (hookText, hookTypeEvidence, section.quote, label.evidence) kaynakta BİREBİR geçmelidir;
 * bunu zod değil sunucu denetler (`lib/intel/evidence` `verifyEvidence`).
 *
 * Kurgu ölçümlerinden yalnız modelin GÖZLEMLEYEBİLECEĞİ on bir tanesi istenir (altısı kurgu, beşi stüdyo sipariş fişi için); `avgShotSec` ve `cutsPerMinute` sayılabilir türevlerdir ve
 * süre + kesme sayısından KODDA hesaplanır (`finalize.ts`): sayılabilene model tahmini yazılmaz.
 */
import "server-only";

import { z } from "zod";

import { EDIT_METRIC_FIELDS } from "@/lib/data/analysis-schema";
import { CTA_TYPES } from "@/lib/domain/taxonomy";
import { frameSchema, ctaTypeSchema, hookSourceSchema, hookTypeSchema, labelAxisSchema, sectionTypeSchema } from "@/lib/llm/taxonomy";

/** `transcripts.language` DB kısıtıyla aynı kalıp ("en", "tr", "und", "pt-BR"). */
export const LANGUAGE_PATTERN = /^[A-Za-z]{2,3}([-_][A-Za-z0-9]{2,8})*$/;

/** Transcript kanalı: DB `transcripts.segments[].channel` değerleri (hook kaynağı `screen_text` ile KARIŞTIRMA). */
export const SEGMENT_CHANNELS = ["speech", "screen"] as const;
export type SegmentChannel = (typeof SEGMENT_CHANNELS)[number];

const segmentSchema = z.object({
  startSec: z.number().nonnegative().finite().describe("segment start, seconds from video start"),
  endSec: z.number().nonnegative().finite().optional().describe("segment end in seconds; omit if unknown"),
  text: z.string().trim().min(1).max(1500).describe("verbatim text, original language, never translated"),
  channel: z.enum(SEGMENT_CHANNELS).describe('"speech" = spoken aloud, "screen" = text shown in the picture'),
});

const sectionSchema = z.object({
  type: sectionTypeSchema,
  quote: z.string().trim().min(1).max(400).describe("verbatim words (2+ words) from speech or on-screen text"),
  startSec: z.number().nonnegative().finite(),
});

const labelSchema = z
  .object({
    key: labelAxisSchema,
    value: z.string().trim().min(1).max(120),
    evidence: z.string().trim().min(1).max(400).describe("verbatim words (2+ words) from speech, on-screen text or caption"),
  })
  .superRefine((label, ctx) => {
    // `frame` ve `cta_type` değerleri de taksonomiden gelir; `topic`/`tone` serbest kısa metindir.
    if (label.key === "frame" && !frameSchema.safeParse(label.value).success) {
      ctx.addIssue({ code: "custom", path: ["value"], message: `for key "frame", value must be one of: ${frameSchema.options.join(", ")}` });
    }
    if (label.key === "cta_type" && !ctaTypeSchema.safeParse(label.value).success) {
      ctx.addIssue({ code: "custom", path: ["value"], message: `for key "cta_type", value must be one of: ${CTA_TYPES.join(", ")}` });
    }
  });

/** Modelden istenen kurgu ölçümleri (hepsi isteğe bağlı: ölçülemeyen alan yazılmaz, 0 ile doldurulmaz). */
export const modelEditMetricsSchema = z
  .object({
    cutCount: EDIT_METRIC_FIELDS.cutCount,
    tempo: EDIT_METRIC_FIELDS.tempo,
    onScreenTextCount: EDIT_METRIC_FIELDS.onScreenTextCount,
    onCameraSpeaker: EDIT_METRIC_FIELDS.onCameraSpeaker,
    hasMusic: EDIT_METRIC_FIELDS.hasMusic,
    hasBurnedCaptions: EDIT_METRIC_FIELDS.hasBurnedCaptions,
    cutsInFirst3Sec: EDIT_METRIC_FIELDS.cutsInFirst3Sec,
    textPosition: EDIT_METRIC_FIELDS.textPosition,
    textLines: EDIT_METRIC_FIELDS.textLines,
    layout: EDIT_METRIC_FIELDS.layout,
    openingVisual: EDIT_METRIC_FIELDS.openingVisual,
  })
  .partial();

export const videoAnalysisOutputSchema = z.object({
  language: z.string().trim().regex(LANGUAGE_PATTERN).describe('spoken language code, e.g. "en"; "und" if none'),
  durationSec: z.number().positive().finite().optional().describe("video length in seconds if known"),
  transcript: z.array(segmentSchema).max(400),
  hookText: z.string().trim().max(400).describe('first spoken sentence, verbatim; "" only if no speech, no screen text and no caption'),
  hookSource: hookSourceSchema,
  hookType: hookTypeSchema,
  hookTypeEvidence: z.string().trim().max(400).describe("verbatim words (2+ words) that show the hook type"),
  sections: z.array(sectionSchema).max(20),
  labels: z.array(labelSchema).max(12),
  editMetrics: modelEditMetricsSchema,
});

export type VideoAnalysisOutput = z.infer<typeof videoAnalysisOutputSchema>;
export type OutputSegment = VideoAnalysisOutput["transcript"][number];
