/**
 * `PanelRepository.updateWorkspace` yamasının doğrulaması: TÜM depo uygulamaları (mock, Supabase) ve
 * ayarlar action'ı aynı şemayı kullanır, kural tek yerde durur. Sınırlar `queries.ts`'tedir.
 */
import { z } from "zod";

import { ACCOUNT_TYPES } from "@/lib/domain/account-type";
import { COMPLIANCE_REGIONS } from "@/lib/domain/compliance";
import { CONTENT_LANGUAGES } from "@/lib/domain/content-language";
import { AGENT_SETTING_LIMITS } from "@/lib/domain/agent-settings";
import { MAX_CAP_USD, NICHE_BRIEF_MAX_LENGTH, type WorkspacePatch } from "@/lib/data/queries";
import { parseOrThrow } from "@/lib/data/parse-input";

/** undefined = değiştirme. Tavan kaldırılamaz: null, negatif, sonsuz, NaN ya da metin geçersiz; 0 geçerli (harcama kapalı). */
const capField = z
  .number({ error: "Tavan bir sayı olmalı." })
  .finite("Tavan bir sayı olmalı.")
  .min(0, "Tavan negatif olamaz.")
  .max(MAX_CAP_USD, `Tavan en fazla ${MAX_CAP_USD} USD olabilir.`)
  .optional();

/** Tam sayı ayar alanı: sınırlar `AGENT_SETTING_LIMITS`'te (DB CHECK'iyle aynı). */
const settingField = (label: string, limit: { min: number; max: number }) =>
  z
    .number({ error: `${label} bir sayı olmalı.` })
    .int(`${label} tam sayı olmalı.`)
    .min(limit.min, `${label} en az ${limit.min} olmalı.`)
    .max(limit.max, `${label} en çok ${limit.max} olabilir.`)
    .optional();

export const workspacePatchSchema = z.object({
  apifyMonthlyCapUsd: capField,
  llmMonthlyCapUsd: capField,
  measureMonthlyCapUsd: capField,
  agentMonthlyCapUsd: capField,
  collectEveryDays: settingField("Toplama sıklığı", AGENT_SETTING_LIMITS.collectEveryDays),
  collectVideoLimit: settingField("Video sayısı", AGENT_SETTING_LIMITS.collectVideoLimit),
  rivalTarget: settingField("Hedef rakip sayısı", AGENT_SETTING_LIMITS.rivalTarget),
  nicheBrief: z
    .string({ error: "Niş tanımı metin olmalı." })
    .trim()
    .refine((text) => Array.from(text).length <= NICHE_BRIEF_MAX_LENGTH, {
      error: `Niş tanımı en fazla ${NICHE_BRIEF_MAX_LENGTH} karakter olabilir.`,
    })
    .optional(),
  complianceRegion: z.enum(COMPLIANCE_REGIONS, { error: "Uyum bölgesi TR, US ya da TR_US olmalı." }).optional(),
  /** null = ayarı kaldır (otomatik); undefined = değiştirme. */
  contentLanguage: z.enum(CONTENT_LANGUAGES, { error: "İçerik dili tr ya da en olmalı." }).nullable().optional(),
  /** undefined = değiştirme; hesap türü kaldırılamaz (null geçersiz). */
  accountType: z.enum(ACCOUNT_TYPES, { error: "Hesap türü işletme, içerik üreticisi ya da karma olmalı." }).optional(),
});

/** Depo uygulamaları için: geçersiz yama `RepositoryError("invalid_input")` fırlatır; temiz (kırpılmış) yamayı döndürür. */
export function parseWorkspacePatch(input: unknown): WorkspacePatch {
  return parseOrThrow(workspacePatchSchema, input, "Geçersiz workspace yaması.");
}
