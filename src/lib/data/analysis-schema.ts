/**
 * İçerik analizi jsonb alanlarının (`content_analyses.edit_metrics`, `evidence_report`) zod şemaları — TEK tanım. Okuma tarafı
 * (Supabase eşleyicisi) kayıtlı değeri doğrular; yazan taraf (video analizi, `lib/video-analysis` / `lib/intel`) DB'ye yazmadan ÖNCE
 * aynı şemayla doğrular. Tip uyumu derleme zamanında denetlenir (`z.ZodType<…>` ataması): domain tipi değişirse burası kırılır.
 */
import { z } from "zod";

import type { EditMetrics, EvidenceReport } from "@/lib/domain/intel";

/** Kurgu ölçümü alanları (hepsi isteğe bağlı: ölçülemeyen alan yazılmaz). Eşleyici alan alan doğrulamak için de kullanır. */
export const EDIT_METRIC_FIELDS = {
  cutCount: z.number().nonnegative().finite(),
  avgShotSec: z.number().nonnegative().finite(),
  cutsPerMinute: z.number().nonnegative().finite(),
  tempo: z.enum(["slow", "medium", "fast"]),
  onScreenTextCount: z.number().nonnegative().finite(),
  onCameraSpeaker: z.boolean(),
  hasMusic: z.boolean(),
  hasBurnedCaptions: z.boolean(),
  cutsInFirst3Sec: z.number().nonnegative().finite(),
  textPosition: z.enum(["top", "middle", "bottom"]),
  textLines: z.number().nonnegative().finite(),
  layout: z.enum(["full", "split", "screen_recording"]),
  openingVisual: z.enum(["face", "product", "screen", "broll"]),
} as const;

export const EDIT_METRICS_SCHEMA: z.ZodType<EditMetrics> = z.object(EDIT_METRIC_FIELDS).partial();

const channel = z.enum(["speech", "screen_text", "caption"]);

const evidenceCheckSchema = z.object({
  target: z.enum(["hook", "hook_type", "section", "label"]),
  key: z.string().optional(),
  quote: z.string(),
  found: z.boolean(),
  channel: channel.optional(),
  failure: z.enum(["empty", "too_short", "too_long", "not_found", "outside_first_quarter"]).optional(),
});

export const EVIDENCE_REPORT_SCHEMA: z.ZodType<EvidenceReport> = z.object({
  verified: z.boolean(),
  corpusWords: z.number().int().nonnegative(),
  insufficientData: z.boolean(),
  hookChannel: channel.optional(),
  checked: z.number().int().nonnegative(),
  passed: z.number().int().nonnegative(),
  failures: z.array(evidenceCheckSchema),
});
