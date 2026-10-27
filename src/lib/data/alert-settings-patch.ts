/**
 * `PanelRepository.updateAlertSettings` yamasının doğrulaması ve birleştirmesi: TÜM depo uygulamaları (mock, Supabase)
 * ve ayarlar action'ı aynı şemayı/kuralı kullanır (`workspace-patch.ts` deseni). Tipler `queries.ts`'te.
 *
 * Şema KATIDIR (`strict`): bilinmeyen alan reddedilir. Bu, sır alanlarının (Telegram anahtarı/sohbet kimliği, e-posta
 * şifresi) yamaya sızmasını da engeller — `telegram.chatIdSet` ve `channels.inApp` yamalanamaz.
 */
import { z } from "zod";

import type { AlertChannels, AlertSettings } from "@/lib/domain/notification";
import type { AlertSettingsPatch } from "@/lib/data/queries";
import { parseOrThrow } from "@/lib/data/parse-input";
import { RepositoryError } from "@/lib/data/repository";

const minTier = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)], { error: "Kademe 1 ile 4 arasında olmalı." });
const flag = z.boolean({ error: "Geçersiz seçim." });

const outlierRule = z.object({ enabled: flag.optional(), minTier: minTier.optional() }).strict();

/** E-posta adresi: kırpılır, en çok 254 karakter; "" adresi siler. */
const emailAddress = z
  .string({ error: "E-posta adresi metin olmalı." })
  .trim()
  .max(254, "E-posta adresi en fazla 254 karakter olabilir.")
  .refine((value) => value === "" || z.email().safeParse(value).success, { error: "Geçerli bir e-posta adresi gir." });

export const alertSettingsPatchSchema = z
  .object({
    competitorOutlier: outlierRule.optional(),
    ownOutlier: outlierRule.optional(),
    weeklyDigest: z
      .object({
        enabled: flag.optional(),
        weekday: z.number({ error: "Gün 0 ile 6 arasında olmalı." }).int("Gün 0 ile 6 arasında olmalı.").min(0, "Gün 0 ile 6 arasında olmalı.").max(6, "Gün 0 ile 6 arasında olmalı.").optional(),
        hour: z.number({ error: "Saat 0 ile 23 arasında olmalı." }).int("Saat 0 ile 23 arasında olmalı.").min(0, "Saat 0 ile 23 arasında olmalı.").max(23, "Saat 0 ile 23 arasında olmalı.").optional(),
      })
      .strict()
      .optional(),
    channels: z
      .object({
        email: z.object({ enabled: flag.optional(), address: emailAddress.optional() }).strict().optional(),
        telegram: z.object({ enabled: flag.optional() }).strict().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

/** Geçersiz yama `RepositoryError("invalid_input")` fırlatır; temiz (kırpılmış) yamayı döndürür. */
export function parseAlertSettingsPatch(input: unknown): AlertSettingsPatch {
  return parseOrThrow(alertSettingsPatchSchema, input, "Geçersiz uyarı ayarı yaması.");
}

/**
 * Yamayı mevcut ayarlarla birleştirir (girdiyi değiştirmez; yeni nesne döner). Yama doğrulanır, sonra çapraz kurallar
 * birleşik sonuca uygulanır:
 *  - e-posta kanalı açıksa adres dolu olmalı → `invalid_input`;
 *  - Telegram kanalı açıksa sohbet bağlı (`chatIdSet`) olmalı → `invalid_state` (bağlama sunucu tarafındadır).
 */
export function applyAlertSettingsPatch(current: AlertSettings, patchInput: unknown): AlertSettings {
  const patch = parseAlertSettingsPatch(patchInput);
  const next: AlertSettings = structuredClone(current);

  assignDefined(next.competitorOutlier, patch.competitorOutlier);
  assignDefined(next.ownOutlier, patch.ownOutlier);
  assignDefined(next.weeklyDigest, patch.weeklyDigest);

  const email: NonNullable<AlertChannels["email"]> = { enabled: false, ...next.channels.email };
  const emailPatch = patch.channels?.email;
  if (emailPatch?.enabled !== undefined) email.enabled = emailPatch.enabled;
  if (emailPatch?.address !== undefined) {
    if (emailPatch.address === "") delete email.address;
    else email.address = emailPatch.address;
  }
  const telegram: NonNullable<AlertChannels["telegram"]> = { enabled: false, chatIdSet: false, ...next.channels.telegram };
  if (patch.channels?.telegram?.enabled !== undefined) telegram.enabled = patch.channels.telegram.enabled;

  if (email.enabled && !email.address) {
    throw new RepositoryError("invalid_input", "E-posta kanalını açmak için bir adres gir.");
  }
  if (telegram.enabled && !telegram.chatIdSet) {
    throw new RepositoryError("invalid_state", "Telegram sohbeti bağlı değil; kanalı açmadan önce sohbeti bağla.");
  }
  next.channels.email = email;
  next.channels.telegram = telegram;
  return next;
}

/** Yalnız değeri tanımlı alanları yazar (`undefined` = dokunma). */
function assignDefined<T extends object>(target: T, source: Partial<T> | undefined): void {
  if (!source) return;
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined) (target as Record<string, unknown>)[key] = value;
  }
}
