/**
 * Elle (sohbetten) eklenen fikir girdisi: depo (mock ve Supabase) ile sohbet AYNI katı şemayı kullanır (`idea-link-input.ts` deseni).
 * `note` hesap sahibinin kendi cümlesidir ve fikrin gerekçesi (`rationale`) olur; platform girdiden gelmez (çalışma alanının kendi hesabı).
 */
import { z } from "zod";

import { parseOrThrow } from "@/lib/data/parse-input";
import { CONTENT_FORMATS } from "@/lib/domain/platform";
import type { ContentFormat } from "@/lib/platforms/types";

export const MANUAL_IDEA_TITLE_MAX = 120;
export const MANUAL_IDEA_NOTE_MAX = 1000;
/** Çalışma alanı başına son 24 saatte eklenebilecek en çok elle fikir sayısı (kötüye kullanım ve taşma sınırı). */
export const MANUAL_IDEA_DAILY_MAX = 20;
/** Format verilmezse kullanılan varsayılan (kısa video panelin ana biçimidir). */
export const MANUAL_IDEA_DEFAULT_FORMAT: ContentFormat = "short_video";

export const manualIdeaSchema = z.strictObject({
  title: z.string({ error: "Fikir başlığı metin olmalı." }).trim().min(1, "Fikir başlığı boş olamaz.").max(MANUAL_IDEA_TITLE_MAX, `Fikir başlığı en fazla ${MANUAL_IDEA_TITLE_MAX} karakter olabilir.`),
  note: z.string({ error: "Fikir notu metin olmalı." }).trim().min(1, "Fikir notu boş olamaz.").max(MANUAL_IDEA_NOTE_MAX, `Fikir notu en fazla ${MANUAL_IDEA_NOTE_MAX} karakter olabilir.`),
  format: z.enum(CONTENT_FORMATS as [ContentFormat, ...ContentFormat[]], { error: "Bilinmeyen içerik biçimi." }).optional(),
});

export type ManualIdeaInput = z.input<typeof manualIdeaSchema>;
export type ParsedManualIdea = { title: string; note: string; format: ContentFormat };

/** Girdiyi doğrular; format yoksa varsayılanı koyar. Geçersizse `RepositoryError("invalid_input")`. */
export function parseManualIdea(input: unknown): ParsedManualIdea {
  const value = parseOrThrow(manualIdeaSchema, input, "Fikir girdisi geçersiz.");
  return { title: value.title, note: value.note, format: value.format ?? MANUAL_IDEA_DEFAULT_FORMAT };
}
