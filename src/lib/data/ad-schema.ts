/**
 * Reklam okumalarının girdi doğrulaması (katı zod): depo (mock ve Supabase) ve ileride server action'lar AYNI şemayı kullanır. v1'de reklam
 * yazma girdisi YOKTUR (yalnız okuma sorguları). Gün sayısı sınırlıdır: günlük ölçü satırı sayısı (reklam × gün) büyür.
 */
import { z } from "zod";

import { parseOrThrow } from "@/lib/data/parse-input";

/** Varsayılan ve en büyük dönem (gün). */
export const AD_PERIOD_DAYS_DEFAULT = 28;
export const AD_PERIOD_DAYS_MAX = 365;
/** `listAdUsage` tek çağrıda en çok içerik. */
export const AD_USAGE_IDS_MAX = 500;

const daysField = z
  .number({ error: "Gün sayısı sayı olmalı." })
  .int("Gün sayısı tam sayı olmalı.")
  .min(1, "Gün sayısı en az 1 olmalı.")
  .max(AD_PERIOD_DAYS_MAX, `Gün sayısı en çok ${AD_PERIOD_DAYS_MAX} olabilir.`);

export const adReportQuerySchema = z.strictObject({
  accountId: z.uuid({ error: "Reklam hesabı kimliği geçersiz." }).optional(),
  days: daysField.optional(),
});

export const adDetailQuerySchema = z.strictObject({ days: daysField.optional() });

export const adUsageIdsSchema = z.array(z.string({ error: "İçerik kimliği geçersiz." }).min(1, "İçerik kimliği geçersiz.").max(100, "İçerik kimliği geçersiz."), { error: "İçerik listesi geçersiz." }).max(AD_USAGE_IDS_MAX, `En çok ${AD_USAGE_IDS_MAX} içerik sorulabilir.`);

export interface AdReportQuery {
  /** Verilmezse çalışma alanının ilk reklam hesabı (hesap adı, sonra kimlik sırasıyla). */
  accountId?: string;
  /** Dönem (gün); varsayılan `AD_PERIOD_DAYS_DEFAULT`. */
  days?: number;
}

export interface AdDetailQuery {
  days?: number;
}

export const parseAdReportQuery = (input: unknown): AdReportQuery => parseOrThrow(adReportQuerySchema, input ?? {}, "Reklam sorgusu geçersiz.");
export const parseAdDetailQuery = (input: unknown): AdDetailQuery => parseOrThrow(adDetailQuerySchema, input ?? {}, "Reklam sorgusu geçersiz.");
export const parseAdUsageIds = (input: unknown): string[] => parseOrThrow(adUsageIdsSchema, input, "İçerik listesi geçersiz.");

// ------------------------------------------------------- Hedef yazımı (tek yazma)

const positive = (label: string) => z.number({ error: `${label} sayı olmalı.` }).positive(`${label} sıfırdan büyük olmalı.`).max(1_000_000, `${label} çok büyük.`);

const resultLabelField = z
  .string({ error: "Sonucun adını yaz." })
  .trim()
  .min(1, "Sonucun adını yaz.")
  .max(100, "Sonucun adı en çok 100 karakter olabilir.");

/**
 * Hesap hedefi (DB `ad_accounts_goal_shape` ile aynı biçim): getiri modunda hedef getiri (+ isteğe bağlı brüt marj), maliyet modunda hedef
 * sonuç maliyeti şart; karşı modun alanı gelirse reddedilir. Panel reklam hesabına DEĞİL yalnız kendi hedef sütunlarına yazar.
 */
export const adGoalSchema = z.discriminatedUnion(
  "kind",
  [
    z.strictObject({
      kind: z.literal("value"),
      resultLabel: resultLabelField,
      targetReturn: positive("Hedef getiri"),
      grossMargin: z.number({ error: "Brüt marj sayı olmalı." }).gt(0, "Brüt marj sıfırdan büyük olmalı.").max(1, "Brüt marj en çok 1 (yüzde 100) olabilir.").optional(),
    }),
    z.strictObject({
      kind: z.literal("cost"),
      resultLabel: resultLabelField,
      targetCostPerResult: positive("Hedef maliyet"),
    }),
  ],
  { error: "Hedef türünü seç." },
);

export const adGoalPatchSchema = z.strictObject({
  accountId: z.uuid({ error: "Reklam hesabı kimliği geçersiz." }),
  /** `null` = hedefi kaldır (hesabın reklamları yeniden karar almaz). */
  goal: adGoalSchema.nullable(),
});

export type AdGoalInput = z.infer<typeof adGoalSchema>;
export interface AdGoalPatch {
  accountId: string;
  goal: AdGoalInput | null;
}

export const parseAdGoalPatch = (input: unknown): AdGoalPatch => parseOrThrow(adGoalPatchSchema, input, "Hedef geçersiz.");
