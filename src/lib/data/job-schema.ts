/**
 * Panel işi satırının (`panel_jobs`, migration 0016) yazma / okuma sözleşmesi — TEK tanım. İşçi (`lib/job-runner`) satırı güncellemeden
 * ÖNCE `jobRowPatchSchema` ile doğrular; depo (`supabase/jobs.ts`, `mappers/job.ts`) okurken jsonb sütunlarını AYNI şemalarla süzer. Tablo
 * check'leriyle aynı sınırlardır (günlük ≤ 8000, hata ≤ 2000 karakter). Tip uyumu derleme zamanında denetlenir (`z.ZodType<…>`): domain
 * (`domain/panel-job.ts`) değişirse burası kırılır.
 *
 * Katı: bilinmeyen alan reddedilir (yazan ve okuyan aynı kod). `undefined ≠ 0`: bilinmeyen tutar / sayaç alanı hiç yazılmaz.
 */
import { z } from "zod";

import { creditUnitsSchema } from "@/lib/data/credit-input";
import { onboardingRivalIdsSchema } from "@/lib/data/onboarding-input";
import { NICHE_BRIEF_MAX_LENGTH } from "@/lib/data/queries";
import { ACCOUNT_TYPES } from "@/lib/domain/account-type";
import { ONBOARDING_BIO_MAX_CHARS, ONBOARDING_NICHE_DRAFT_MAX_CHARS, ONBOARDING_PHASES, type OnboardingProbeResult } from "@/lib/domain/onboarding-job";
import { HANDLE_PATTERN } from "@/lib/domain/competitor";
import { PLATFORMS } from "@/lib/domain/platform";
import type { ParsedJobRequest } from "@/lib/data/job-input";
import {
  JOB_COLLECT_LIMIT_MAX,
  JOB_ERROR_MAX_CHARS,
  JOB_LOG_TAIL_MAX_CHARS,
  JOB_OUTCOME_CODES,
  JOB_STATUSES,
  JOB_STEP_IDS,
  JOB_STEP_STATUSES,
  type JobParams,
  type JobProgress,
  type JobResult,
  type JobStep,
} from "@/lib/domain/panel-job";
import { isWeekStart } from "@/lib/domain/weekly-plan";
import type { Database, Json } from "@/lib/supabase/database.types";

/** Adım notunun üst sınırı (karakter): tek satır özet; uzun döküm günlüğe (`log_tail`) gider. */
export const JOB_STEP_NOTE_MAX_CHARS = 500;
/** Tahmin dökümünün en çok satırı (hesap başına birkaç koşu). */
export const JOB_ESTIMATE_LINES_MAX = 60;

const usd = z.number().nonnegative();
const count = z.number().int().nonnegative();
const isoSchema = z.iso.datetime({ offset: true });

export const jobParamsSchema: z.ZodType<JobParams> = z
  .strictObject({
    limit: z.number().int().min(1).max(JOB_COLLECT_LIMIT_MAX).optional(),
    week: z.string().refine(isWeekStart, "Hafta Pazartesi günü (YYYY-MM-DD) olmalı").optional(),
    slot: z.string().regex(/^[A-Za-z0-9]{1,8}$/, "Slot kısa bir kod olmalı (S1, P2).").optional(),
    ideaId: z.uuid().optional(),
    phase: z.enum(ONBOARDING_PHASES).optional(),
    rivalIds: onboardingRivalIdsSchema.optional(),
    source: z.enum(["cycle", "agent"]).optional(),
  })
  .refine((params) => params.rivalIds === undefined || params.phase === "build", "Rakip seçimi yalnız ilk tur işinde olur");

/**
 * `result.probe`: başlangıç `probe` işinin çıktısı (profil özeti + video sayısı + aday özeti + tür ön seçimi + konu taslağı). Yazan işçi ve
 * okuyan depo (`getOnboardingState`) AYNI şema. Fotoğraf adresi, yorumcu / takipçi kimliği gibi alanlar YOKTUR (katı şema reddeder).
 */
export const onboardingProbeResultSchema: z.ZodType<OnboardingProbeResult> = z.strictObject({
  profile: z.strictObject({
    platform: z.enum(PLATFORMS),
    handle: z.string().regex(HANDLE_PATTERN),
    displayName: z.string().trim().min(1).max(150).optional(),
    bio: z.string().max(ONBOARDING_BIO_MAX_CHARS).optional(),
    followers: count.optional(),
    postsCount: count.optional(),
    isVerified: z.boolean().optional(),
  }),
  videoCount: count.optional(),
  candidates: z.strictObject({ total: count, similarSize: count.optional() }).optional(),
  suggestedAccountType: z.enum(ACCOUNT_TYPES).optional(),
  nicheDraft: z.string().trim().min(1).max(Math.min(ONBOARDING_NICHE_DRAFT_MAX_CHARS, NICHE_BRIEF_MAX_LENGTH)).optional(),
});

export const jobStepSchema: z.ZodType<JobStep> = z.strictObject({
  id: z.enum(JOB_STEP_IDS),
  status: z.enum(JOB_STEP_STATUSES),
  code: z.enum(JOB_OUTCOME_CODES).optional(),
  note: z.string().max(JOB_STEP_NOTE_MAX_CHARS).optional(),
  seconds: z.number().nonnegative().optional(),
  spend: z.strictObject({ estimateUsd: usd.optional(), actualUsd: usd.optional() }).optional(),
});

/** `panel_jobs.steps`: adımlar koşu sırasıyla; aynı adım iki kez yazılmaz. */
export const jobStepsSchema: z.ZodType<JobStep[]> = z
  .array(jobStepSchema)
  .max(JOB_STEP_IDS.length)
  .refine((steps) => new Set(steps.map((step) => step.id)).size === steps.length, "Aynı adım iki kez yazılamaz");

/** `panel_jobs.progress`: sayaç (yapılan ≤ toplam). Sayaç yoksa sütun NULL'dır (0/0 yazılmaz). */
export const jobProgressSchema: z.ZodType<JobProgress> = z
  .strictObject({ done: z.number().int().nonnegative(), total: z.number().int().nonnegative() })
  .refine((progress) => progress.done <= progress.total, "Yapılan sayısı toplamı aşamaz");

/** `panel_jobs.result`. DB yetim işi kapatırken yalnız `outcome`'u yazar (`worker_lost`): bütün alanlar isteğe bağlıdır. */
export const jobResultSchema: z.ZodType<JobResult> = z.strictObject({
  outcome: z.enum(JOB_OUTCOME_CODES).optional(),
  exitCode: z.number().int().optional(),
  estimate: z
    .strictObject({
      usd: usd.optional(),
      lines: z.array(z.strictObject({ label: z.string().trim().min(1).max(120), usd: usd.optional() })).max(JOB_ESTIMATE_LINES_MAX),
      units: z.strictObject({ accounts: count.optional(), videos: count.optional(), measureRuns: count.optional() }).optional(),
    })
    .optional(),
  spend: z.strictObject({ reservedUsd: usd.optional(), actualUsd: usd.optional() }).optional(),
  credits: z.strictObject({ reserved: count, due: count, charged: count.optional(), units: creditUnitsSchema.optional(), priceVersion: z.string().trim().min(1).max(40).optional() }).optional(),
  reportPath: z.string().trim().min(1).max(300).optional(),
  probe: onboardingProbeResultSchema.optional(),
});

type DbUpdate = Database["public"]["Tables"]["panel_jobs"]["Update"];
type DbFunctions = Database["public"]["Functions"];

/** İşçinin yazabildiği sütunlar. Kimlik ve onay sütunları YOKTUR: DB trigger'ı zaten değiştirtmez. */
export type JobRowPatch = Pick<DbUpdate, "status" | "steps" | "current_step" | "progress" | "log_tail" | "result" | "error" | "heartbeat_at" | "finished_at">;

/**
 * İşçinin çitli yazımının (`update … where id = ? and worker_id = ? and status = 'running'`) gövdesi. Yazımdan ÖNCE bununla doğrulanır;
 * 0 satır dönerse işçi durur (iş elinden alınmış ya da kapatılmış). `null` = sütunu boşalt (sayaç bitti, adım yok).
 */
export const jobRowPatchSchema: z.ZodType<JobRowPatch> = z.strictObject({
  status: z.enum(JOB_STATUSES).optional(),
  steps: jobStepsSchema.optional(),
  current_step: z.enum(JOB_STEP_IDS).nullable().optional(),
  progress: jobProgressSchema.nullable().optional(),
  log_tail: z.string().max(JOB_LOG_TAIL_MAX_CHARS).nullable().optional(),
  result: jobResultSchema.nullable().optional(),
  error: z.string().max(JOB_ERROR_MAX_CHARS).nullable().optional(),
  heartbeat_at: isoSchema.optional(),
  finished_at: isoSchema.nullable().optional(),
});

/** Metnin SONUNU tutar (kod noktası sayar, DB `char_length` ile aynı): günlük kuyruğu ve hata metni sınırı aşmasın. */
export function clipTail(text: string, max: number = JOB_LOG_TAIL_MAX_CHARS): string {
  const chars = Array.from(text);
  return chars.length <= max ? text : chars.slice(chars.length - max).join("");
}

/** Kredi ayırması (yalnız zorlama açıkken): hesap sahibi + ayrılacak en çok kredi. Sahip depo bağlamından gelir, girdiden ASLA. */
export interface JobCreditHoldArgs {
  ownerUserId: string;
  maxCredits: number;
}

/**
 * `request_panel_job_credited` argümanları (istek → RPC). Üretilen tip NULL'u göstermez ama PostgREST kabul eder: onaysız işte dayanak boş
 * metin (RPC NULL'a çevirir), tutar NULL gider — dönüşüm yalnız burada. Kuyruk ve kullanıcı çağıranın (depo bağlamı) verdiğidir, girdiden
 * gelmez. `hold` verilmezse kredi parametreleri HİÇ gönderilmez (RPC varsayılanı NULL: kredisiz iş, 0016 davranışı).
 */
export function requestPanelJobArgs(wsId: string, queue: string, request: ParsedJobRequest, userId: string, hold?: JobCreditHoldArgs): DbFunctions["request_panel_job_credited"]["Args"] {
  // `monthly_cap`'te satırda tutar yoktur (tavan çalışma alanındadır); `one_time` ve `onboarding` tutar taşır.
  const maxUsd = request.approval === undefined || request.approval.basis === "monthly_cap" ? null : request.approval.maxUsd;
  return {
    ...(hold === undefined ? {} : { p_credit_owner: hold.ownerUserId, p_max_credits: hold.maxCredits }),
    p_ws: wsId,
    p_queue: queue,
    p_kind: request.kind,
    p_dry_run: request.dryRun,
    p_params: request.params as Json,
    p_approval_basis: request.approval?.basis ?? "",
    p_approved_max_usd: maxUsd as number,
    p_user: userId,
  };
}
