/**
 * Analist'in LLM çıktı şeması (belirteçli, SON olmayan metin). Katı: bilinmeyen alan reddedilir; sayı alanı YOK (sayı yalnız metinde
 * belirteç olarak yazılır, kod yerleştirir). Güven ve eylem metni/bağlantısı ajanın işi değildir: güveni kod hesaplar, eylemi yalnız
 * paketteki `actionId`'lerden seçilir. SON biçim (sayıları yerleştirilmiş) `lib/data/briefing-schema.ts`'tedir.
 */
import { z } from "zod";

import { BRIEFING_BODY_MAX, BRIEFING_EVIDENCE_MAX, BRIEFING_HEADLINE_MAX, BRIEFING_ITEM_KINDS, BRIEFING_ITEMS_MAX, BRIEFING_ITEMS_MIN } from "@/lib/domain/briefing";

export const ANALYST_ITEM_SCHEMA = z.strictObject({
  kind: z.enum(BRIEFING_ITEM_KINDS).describe("changed | worked | opportunity | next_step | pending"),
  headline: z.string().trim().min(1).max(BRIEFING_HEADLINE_MAX).describe("Short Turkish headline; numbers only as tokens"),
  body: z.string().trim().min(1).max(BRIEFING_BODY_MAX).describe("One or two short Turkish sentences; numbers only as tokens like {lift:c:ID} or {g:followers}"),
  evidence: z.array(z.string()).min(1).max(BRIEFING_EVIDENCE_MAX).describe("refs copied exactly from the facts (c:..., cell:..., topic:..., plan:..., idea:..., due:...)"),
  actionId: z.string().optional().describe("action id (open_video:REF, open_matrix:REF (cell or topic ref), open_plan:REF, approve_link:REF or a command id from facts.commands); required when kind is next_step"),
});

export const ANALYST_OUTPUT_SCHEMA = z.strictObject({
  items: z.array(ANALYST_ITEM_SCHEMA).min(BRIEFING_ITEMS_MIN).max(BRIEFING_ITEMS_MAX).describe("1 to 5 items, most important first; fewer when little is strong"),
});

export type AnalystItemOutput = z.infer<typeof ANALYST_ITEM_SCHEMA>;
export type AnalystOutput = z.infer<typeof ANALYST_OUTPUT_SCHEMA>;
