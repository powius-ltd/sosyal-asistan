/**
 * Yayın işi uyum alanlarının doğrulaması (reklam veren adı, Trial Reels): TÜM depo uygulamaları (mock, Supabase) ve
 * server action'lar aynı şemayı kullanır (`workspace-patch.ts` deseni). Sınırlar `lib/domain/publish.ts`'tedir.
 */
import { z } from "zod";

import { ADVERTISER_NAME_MAX, TRIAL_GRADUATIONS, type TrialSettings } from "@/lib/domain/publish";
import { parseOrThrow } from "@/lib/data/parse-input";
import { PLATFORM_LABEL, type Platform } from "@/lib/domain/platform";
import { supportsPublishing } from "@/lib/platforms/registry";

/** Reklam veren adı: kırpılır, en çok `ADVERTISER_NAME_MAX` karakter (kod noktası); boş metin "yok" demektir (undefined). */
export const advertiserNameSchema = z
  .string({ error: "Reklam veren adı metin olmalı." })
  .trim()
  .refine((text) => Array.from(text).length <= ADVERTISER_NAME_MAX, { error: `Reklam veren adı en fazla ${ADVERTISER_NAME_MAX} karakter olabilir.` })
  .transform((text) => (text === "" ? undefined : text))
  .optional();

/** Trial Reels: `enabled` boolean, `graduation` "manual" | "performance"; bilinmeyen alan reddedilir. */
export const trialSchema = z
  .object({
    enabled: z.boolean({ error: "Trial Reels seçimi geçersiz." }),
    graduation: z.enum(TRIAL_GRADUATIONS, { error: "Trial Reels mezuniyet stratejisi “manual” ya da “performance” olmalı." }),
  })
  .strict()
  .optional();

/** Depo uygulamaları için: geçersiz girdi `invalid_input` fırlatır; kırpılmış adı (ya da undefined) döndürür. */
export function parseAdvertiserName(input: unknown): string | undefined {
  return parseOrThrow(advertiserNameSchema, input, "Geçersiz reklam veren adı.");
}

export function parseTrial(input: unknown): TrialSettings | undefined {
  return parseOrThrow(trialSchema, input, "Geçersiz Trial Reels ayarı.");
}

/**
 * Hesabın platformunda resmi yayın yoksa Türkçe sebep, varsa undefined. Yayın kuralları (açıklama sınırı, kota) platformun modülündedir
 * (`PlatformModule.publishing`); kural bildirmeyen platformda başka platformun kuralı SESSİZCE uygulanmaz, yayın işi hiç açılmaz.
 */
export function publishPlatformProblem(platform: Platform): string | undefined {
  return supportsPublishing(platform) ? undefined : `${PLATFORM_LABEL[platform]} için yayın henüz desteklenmiyor: bu platformda yayın işi açılamaz.`;
}
