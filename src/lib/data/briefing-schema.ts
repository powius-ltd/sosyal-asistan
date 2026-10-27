/**
 * Ajan brifingi yazma/okuma sözleşmesi — TEK tanım. `brief:now` (Analist) `agent_briefings` satırını yazmadan ÖNCE `briefingRowSchema` ile
 * doğrular; Supabase deposu (`supabase/briefings.ts`) okurken `payload`/`basis` jsonb'sini AYNI şemalarla süzer. Tablo check'leri
 * (migration 0012: 1–5 madde, nesne biçimi, sürümler boş değil) ile aynı kurallardır. Tip uyumu derleme zamanında denetlenir
 * (`z.ZodType<…>`): domain (`domain/briefing.ts`) ya da tablo değişirse burası kırılır.
 *
 * Bu şema SON (kodca doğrulanmış, sayıları yerleştirilmiş) çıktıyı doğrular; Analist'in LLM çıktı şeması (belirteçli metin) ayrıdır
 * (`agents/analyst/schema`). Katı: bilinmeyen alan reddedilir (yazan ve okuyan aynı kod). Kurallar: ≥ 1 kanıt ref'i (biçimi
 * `briefing-refs`), `next_step` maddesinde eylem zorunlu, eylem tutarlı (`briefingActionIssues`), metinler sınırlı ve boş değil.
 */
import { z } from "zod";

import {
  ANALYST_AGENT,
  BRIEFING_ACTION_LABEL_MAX,
  BRIEFING_ACTION_TYPES,
  BRIEFING_AGENTS,
  BRIEFING_BODY_MAX,
  BRIEFING_COMMAND_IDS,
  BRIEFING_EVIDENCE_MAX,
  BRIEFING_HEADLINE_MAX,
  BRIEFING_ITEM_KINDS,
  BRIEFING_ITEMS_MAX,
  BRIEFING_ITEMS_MIN,
  BRIEFING_SCHEMA_VERSION,
  type BriefingAction,
  type BriefingBasis,
  type BriefingEvidenceRef,
  type BriefingItem,
} from "@/lib/domain/briefing";
import { briefingActionIssues, isBriefingRef } from "@/lib/domain/briefing-refs";
import { isWeekStart, type ConfidenceLevel } from "@/lib/domain/weekly-plan";
import type { Database } from "@/lib/supabase/database.types";

type DbInsert = Database["public"]["Tables"]["agent_briefings"]["Insert"];

/** Kırpılmış, boş olmayan, ≤ `max` kod noktası (DB `char_length` ile aynı sayım). */
const boundedText = (max: number) =>
  z
    .string()
    .trim()
    .min(1, "Metin boş olamaz")
    .refine((text) => [...text].length <= max, `Metin en çok ${max} karakter olabilir`);

const confidenceSchema = z.enum(["high", "medium", "low"]) satisfies z.ZodType<ConfidenceLevel>;
const refSchema = z.custom<BriefingEvidenceRef>(isBriefingRef, "Geçersiz kanıt ref'i");
const isoSchema = z.iso.datetime({ offset: true });

export const briefingActionSchema: z.ZodType<BriefingAction> = z
  .strictObject({
    type: z.enum(BRIEFING_ACTION_TYPES),
    label: boundedText(BRIEFING_ACTION_LABEL_MAX),
    target: refSchema.optional(),
    commandId: z.enum(BRIEFING_COMMAND_IDS).optional(),
    spendsMoney: z.boolean(),
  })
  .superRefine((action, ctx) => {
    for (const message of briefingActionIssues(action)) ctx.addIssue({ code: "custom", message });
  });

export const briefingItemSchema: z.ZodType<BriefingItem> = z
  .strictObject({
    kind: z.enum(BRIEFING_ITEM_KINDS),
    headline: boundedText(BRIEFING_HEADLINE_MAX),
    body: boundedText(BRIEFING_BODY_MAX),
    evidence: z.array(refSchema).min(1, "En az bir kanıt ref'i gerekir").max(BRIEFING_EVIDENCE_MAX),
    action: briefingActionSchema.optional(),
    confidence: confidenceSchema,
  })
  .superRefine((item, ctx) => {
    if (item.kind === "next_step" && item.action === undefined) ctx.addIssue({ code: "custom", message: "next_step maddesi eylem ister", path: ["action"] });
  });

/** `agent_briefings.payload`: sürüm + 1–5 madde (tablo check'i aynı sınırdır). */
export const briefingPayloadSchema = z.strictObject({
  schemaVersion: z.literal(BRIEFING_SCHEMA_VERSION),
  items: z.array(briefingItemSchema).min(BRIEFING_ITEMS_MIN).max(BRIEFING_ITEMS_MAX),
});

/** `agent_briefings.basis`: dayanak. Bilinmeyen alan yazılmaz (undefined ≠ 0: yoksa alan hiç yazılmaz). */
export const briefingBasisSchema: z.ZodType<BriefingBasis> = z.strictObject({
  analyzedCount: z.number().int().nonnegative(),
  labeledCount: z.number().int().nonnegative(),
  lastCollectedAt: isoSchema.optional(),
  planWeek: z.string().refine(isWeekStart, "Plan haftası Pazartesi günü (YYYY-MM-DD) olmalı").optional(),
});

export type BriefingPayload = z.infer<typeof briefingPayloadSchema>;

/** DB'ye yazılacak satır (`agent_briefings` Insert). Yazan: yalnız sunucu görevi (service role). */
export const briefingRowSchema: z.ZodType<DbInsert> = z.strictObject({
  id: z.uuid().optional(),
  workspace_id: z.string().min(1),
  agent: z.enum(BRIEFING_AGENTS).default(ANALYST_AGENT),
  generated_at: isoSchema.optional(),
  payload: briefingPayloadSchema,
  basis: briefingBasisSchema,
  prompt_version: z.string().trim().min(1),
  persona_version: z.string().trim().min(1),
  model: z.string().min(1).nullish(),
  run_id: z.string().min(1).nullish(),
});
