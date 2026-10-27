/**
 * Başlangıç akışı depo metotlarının girdi tipleri ve doğrulaması — TEK tanım. Depo uygulamaları (mock, Supabase) ve akış action'ları
 * (`app/actions/onboarding.ts`) aynı şemayı kullanır (`workspace-patch.ts` deseni). Şemalar KATIDIR: action doğrudan POST edilebilir;
 * harcama tavanı, onay, çalışma alanı kimliği, kuyruk gibi alanlar hiçbir yoldan girdiye sızamaz (tavan `ONBOARDING_PHASE_SPEC`'ten gelir).
 */
import { z } from "zod";

import { parseOrThrow } from "@/lib/data/parse-input";
import { workspacePatchSchema } from "@/lib/data/workspace-patch";
import type { AccountType } from "@/lib/domain/account-type";
import { ONBOARDING_RIVALS_MAX } from "@/lib/domain/onboarding-job";

/**
 * `confirmOnboardingAccount` girdisi ("bu sen misin?" + tür + konu): `accountType` kullanıcının seçtiği türdür (ön seçim yalnız öneridir);
 * `nicheBrief` verilirse konu tanımı yazılır ("" siler), verilmezse dokunulmaz (kullanıcı boş geçti).
 */
export interface ConfirmOnboardingAccountInput {
  accountType: AccountType;
  nicheBrief?: string;
}

/** `startOnboardingBuild` girdisi ("Başlat"): izlemeye alınacak rakipler (`competitors.id`; aday ya da zaten izlenen). Boş / yok = rakipsiz. */
export interface StartOnboardingBuildInput {
  rivalIds?: string[];
}

/**
 * `addOnboardingRival` girdisi ("bildiğin bir hesabı ekle"): yalnız kullanıcı adı (ya da bağlantı). Platform girdiden GELMEZ: akıştaki
 * kendi hesabın platformudur (rakip aynı platformdan olur); durum her zaman `candidate`, kaynak `manual`.
 */
export interface AddOnboardingRivalInput {
  handle: string;
}

const UNKNOWN_FIELD = "Geçersiz bir alan gönderildi.";
const strict = <T extends z.ZodRawShape>(shape: T) => z.strictObject(shape, { error: (issue) => (issue.code === "unrecognized_keys" ? UNKNOWN_FIELD : undefined) });

const RIVALS_MESSAGE = `En çok ${ONBOARDING_RIVALS_MAX} rakip seçebilirsin.`;

/** Rakip kimlik listesi: metin kimlikler, tekrarsız, en çok `ONBOARDING_RIVALS_MAX` (iş parametresi ve "Başlat" girdisi AYNI kural). */
export const onboardingRivalIdsSchema = z
  .array(z.string({ error: "Rakip seçimi geçersiz." }).trim().min(1, "Rakip seçimi geçersiz.").max(64, "Rakip seçimi geçersiz."), { error: "Rakip seçimi geçersiz." })
  .max(ONBOARDING_RIVALS_MAX, RIVALS_MESSAGE)
  .refine((ids) => new Set(ids).size === ids.length, "Aynı rakip iki kez seçilemez.");

export const confirmOnboardingAccountSchema = strict({
  accountType: workspacePatchSchema.shape.accountType.unwrap(),
  nicheBrief: workspacePatchSchema.shape.nicheBrief,
}) satisfies z.ZodType<ConfirmOnboardingAccountInput>;

export const startOnboardingBuildSchema = strict({ rivalIds: onboardingRivalIdsSchema.optional() }) satisfies z.ZodType<StartOnboardingBuildInput>;

export const addOnboardingRivalSchema = strict({ handle: z.string({ error: "Kullanıcı adı geçersiz." }).trim().min(1, "Kullanıcı adı geçersiz.").max(300, "Kullanıcı adı geçersiz.") }) satisfies z.ZodType<AddOnboardingRivalInput>;

export function parseAddOnboardingRival(input: unknown): AddOnboardingRivalInput {
  return parseOrThrow<AddOnboardingRivalInput>(addOnboardingRivalSchema, input, "Kullanıcı adı geçersiz.");
}

export function parseConfirmOnboardingAccount(input: unknown): ConfirmOnboardingAccountInput {
  return parseOrThrow<ConfirmOnboardingAccountInput>(confirmOnboardingAccountSchema, input, "Hesap onayı geçersiz.");
}

/** Normalleştirilmiş "Başlat" girdisi: rakip listesi her zaman dizidir (boş = rakipsiz). */
export function parseStartOnboardingBuild(input: unknown): { rivalIds: string[] } {
  const parsed = parseOrThrow<StartOnboardingBuildInput>(startOnboardingBuildSchema, input ?? {}, "Başlatma isteği geçersiz.");
  return { rivalIds: parsed.rivalIds ?? [] };
}
