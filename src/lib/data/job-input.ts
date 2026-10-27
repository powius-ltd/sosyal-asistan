/**
 * Panel işi isteğinin girdi doğrulaması — TEK tanım. TÜM depo uygulamaları (mock, Supabase) ve iş action'ları (`app/actions/jobs.ts`)
 * aynı şemayı kullanır (`workspace-patch.ts` deseni). Tipler `queries.ts`'te, kurallar `domain/panel-job.ts`'te (tür tablosu, onay).
 *
 * Action doğrudan POST edilebilir: şema KATIDIR (ayrımlı birleşim + `strictObject`). Tür beyaz listeden, alanlar türe göre; bilinmeyen
 * alan reddedilir (çalışma alanı kimliği, kuyruk adı, işçi, komut gibi alanlar hiçbir yoldan girdiye sızamaz). Tutar ≤ `JOB_SPEND_MAX_USD`.
 * DB kısıtları (migration 0016) aynı kuralların ikinci savunma hattıdır. Başlangıç işi (`onboarding`) onay / kredi alanı KABUL ETMEZ:
 * onayı burada, aşamanın sabit tavanıyla sunucu kurar (`ONBOARDING_PHASE_SPEC`; DB tam eşitlik ister).
 */
import { z } from "zod";

import { isCopyEdition } from "@/lib/edition";
import { parseOrThrow } from "@/lib/data/parse-input";
import { onboardingRivalIdsSchema } from "@/lib/data/onboarding-input";
import type { JobApprovalInput, RequestJobInput } from "@/lib/data/queries";
import { RepositoryError } from "@/lib/data/repository";
import {
  AGENT_CAP_KINDS,
  availableApprovalBases,
  JOB_COLLECT_LIMIT_MAX,
  JOB_SPEND_MAX_USD,
  jobAcceptsBasis,
  jobAllowsApproval,
  jobRequiresApproval,
  type JobKind,
  type JobParams,
  type JobSpendCaps,
} from "@/lib/domain/panel-job";
import { CREDIT_HOLD_MAX } from "@/lib/domain/credits";
import { jobHoldCredits, jobSpendsCredits } from "@/lib/domain/job-credits";
import { ONBOARDING_PHASE_SPEC, ONBOARDING_PHASES } from "@/lib/domain/onboarding-job";
import { isWeekStart } from "@/lib/domain/weekly-plan";

/** Katı nesne: bilinmeyen alan Türkçe mesajla reddedilir. */
const strict = <T extends z.ZodRawShape>(shape: T) =>
  z.strictObject(shape, { error: (issue) => (issue.code === "unrecognized_keys" ? "Bu iş türünde geçersiz bir alan gönderildi." : undefined) });

/** Halka zincirinin işareti (günlük tavan sayımı); yalnız `cycle` kabul edilir. */
const sourceField = z.literal("cycle").optional();
/** Yönetici ajanın işareti (aylık ajan tavanı dayanağı yalnız bununla geçer); yalnız paralı `collect` / `discover` alanıdır. */
const agentSourceField = z.literal("agent").optional();

const AMOUNT_MESSAGE = `Tutar 0'dan büyük, en çok ${JOB_SPEND_MAX_USD} USD olmalı.`;
const LIMIT_MESSAGE = `İçerik sayısı 1 ile ${JOB_COLLECT_LIMIT_MAX} arasında tam sayı olmalı.`;

const CREDITS_MESSAGE = `Kredi sınırı 1 ile ${CREDIT_HOLD_MAX} arasında tam sayı olmalı.`;

const dryRunField = z.boolean({ error: "Önizleme seçimi geçersiz." }).optional();
/** Kredi onayı (her türde isteğe bağlı): en çok harcanacak kredi. */
const maxCreditsField = z.number({ error: CREDITS_MESSAGE }).int(CREDITS_MESSAGE).min(1, CREDITS_MESSAGE).max(CREDIT_HOLD_MAX, CREDITS_MESSAGE).optional();

export const jobApprovalInputSchema = z.discriminatedUnion(
  "basis",
  [
    strict({ basis: z.literal("one_time"), maxUsd: z.number({ error: AMOUNT_MESSAGE }).gt(0, AMOUNT_MESSAGE).max(JOB_SPEND_MAX_USD, AMOUNT_MESSAGE) }),
    strict({ basis: z.literal("monthly_cap") }),
  ],
  { error: "Onay biçimi geçersiz." },
) satisfies z.ZodType<JobApprovalInput>;

const approvalField = jobApprovalInputSchema.optional();
const limitField = z.number({ error: LIMIT_MESSAGE }).int(LIMIT_MESSAGE).min(1, LIMIT_MESSAGE).max(JOB_COLLECT_LIMIT_MAX, LIMIT_MESSAGE).optional();
const slotField = z.string({ error: "Slot metin olmalı." }).regex(/^[A-Za-z0-9]{1,8}$/, "Slot kısa bir kod olmalı (S1, P2).").optional();
const ideaIdField = z.uuid({ error: "Fikir kimliği geçersiz." }).optional();
const weekField = z.string({ error: "Hafta metin olmalı." }).refine(isWeekStart, "Hafta bir Pazartesi günü olmalı (YYYY-AA-GG).").optional();

/**
 * Onay ↔ tür / kuru koşu tutarlılığı (KISIT 1–2 ve tür tablosu). Sorun yoksa undefined, varsa kullanıcıya gösterilebilir Türkçe mesaj.
 * Kural tek yerde: `requestJobSchema` ve `requestRoutineForAllSchema` bunu çağırır.
 */
export function jobApprovalProblem(kind: JobKind, dryRun: boolean, approval: JobApprovalInput | undefined): string | undefined {
  if (approval === undefined) {
    return jobRequiresApproval(kind, dryRun) ? "Bu iş para harcar: tutar onayı olmadan başlatılamaz." : undefined;
  }
  if (!jobAllowsApproval(kind, dryRun)) return dryRun ? "Önizleme para harcamaz: onay verilemez." : "Bu iş para harcamaz: onay verilemez.";
  if (!jobAcceptsBasis(kind, approval.basis)) return "Bu iş türünde bu onay biçimi kullanılamaz.";
  return undefined;
}

/** Kredi onayı ↔ tür / kuru koşu tutarlılığı. Sorun yoksa undefined. */
export function jobCreditsProblem(kind: JobKind, dryRun: boolean, maxCredits: number | undefined): string | undefined {
  if (maxCredits === undefined) return undefined;
  if (dryRun) return "Önizleme kredi harcamaz: kredi sınırı verilemez.";
  return jobSpendsCredits(kind) ? undefined : "Bu iş kredi harcamaz: kredi sınırı verilemez.";
}

/** Yalnız haftalık tur alanları (tür yok): "tüm hesaplar için başlat" action'ı bunu kullanır. */
const routineFields = { dryRun: dryRunField, approval: approvalField, maxCredits: maxCreditsField };

export const requestJobSchema = z
  .discriminatedUnion(
    "kind",
    [
      strict({ kind: z.literal("routine"), ...routineFields }),
      strict({ kind: z.literal("collect"), dryRun: dryRunField, limit: limitField, approval: approvalField, maxCredits: maxCreditsField, source: agentSourceField }),
      strict({ kind: z.literal("measure"), dryRun: dryRunField, approval: approvalField, maxCredits: maxCreditsField }),
      strict({ kind: z.enum(["analyze", "label", "briefing"]), maxCredits: maxCreditsField, source: sourceField }),
      // Halka uçları: Zernio ölçümü alansızdır ($0, önizlemesiz); keşif Apify'a gider, tutar onayı ister (önizlemesiz: kuru koşu alanı yok).
      strict({ kind: z.literal("measure_zernio"), source: sourceField }),
      // Stüdyo siparişi: hafta zorunlu; slot / fikir isteğe bağlı. $0, onaysız, önizlemesiz.
      strict({ kind: z.literal("order"), week: z.string({ error: "Hafta metin olmalı." }).refine(isWeekStart, "Hafta bir Pazartesi günü olmalı (YYYY-AA-GG)."), slot: slotField, ideaId: ideaIdField, source: sourceField }),
      // Dönüş + yayın: alansız, $0, onaysız (insan onayı yayın satırındadır), önizlemesiz.
      strict({ kind: z.literal("order_return"), source: sourceField }),
      strict({ kind: z.literal("publish"), source: sourceField }),
      // Reklam verisini okuma: alansız, $0, onaysız (Apify parası yok, reklam hesabına yazmaz), önizlemesiz.
      strict({ kind: z.literal("ads_sync"), source: sourceField }),
      strict({ kind: z.literal("discover"), approval: approvalField, maxCredits: maxCreditsField, source: agentSourceField }),
      strict({ kind: z.literal("plan"), week: weekField, maxCredits: maxCreditsField, source: sourceField }),
      // Başlangıç işi: yalnız aşama (+ ilk turda rakip seçimi). Onay, tutar ve kredi sınırı alanı YOKTUR (katı şema reddeder).
      strict({ kind: z.literal("onboarding"), phase: z.enum(ONBOARDING_PHASES, { error: "Aşama geçersiz." }), rivalIds: onboardingRivalIdsSchema.optional() }),
    ],
    { error: "Bilinmeyen iş türü." },
  )
  .superRefine((input, ctx) => {
    if (input.kind === "onboarding") {
      // Onayı sunucu yazar (`parseRequestJobInput`); rakip seçimi yalnız ilk turda.
      if (input.phase !== "build" && input.rivalIds !== undefined) ctx.addIssue({ code: "custom", message: "Rakip seçimi yalnız ilk turda yapılır.", path: ["rivalIds"] });
      return;
    }
    if (input.kind === "measure_zernio" || input.kind === "order" || input.kind === "order_return" || input.kind === "publish" || input.kind === "ads_sync") return; // alansız, $0
    const dryRun = "dryRun" in input && input.dryRun === true;
    const problem = jobApprovalProblem(input.kind, dryRun, "approval" in input ? input.approval : undefined);
    if (problem !== undefined) ctx.addIssue({ code: "custom", message: problem, path: ["approval"] });
    // Aylık ajan tavanı dayanağı ↔ ajan işareti birbirine kilitli (DB trigger'ı da aynısını ister).
    if ((input.kind === "collect" || input.kind === "discover") && !dryRun) {
      const agentBasis = input.approval?.basis === "monthly_cap";
      if (agentBasis && input.source !== "agent") ctx.addIssue({ code: "custom", message: "Bu iş türünde bu onay biçimi kullanılamaz.", path: ["approval"] });
      if (!agentBasis && input.source === "agent") ctx.addIssue({ code: "custom", message: "Ajan işareti yalnız aylık tavan onayıyla kullanılır.", path: ["source"] });
    }
    const credits = jobCreditsProblem(input.kind, dryRun, input.maxCredits);
    if (credits !== undefined) ctx.addIssue({ code: "custom", message: credits, path: ["maxCredits"] });
  }) satisfies z.ZodType<RequestJobInput>;

/** "Tüm hesaplar için başlat": her çalışma alanına bir haftalık tur; onay tutarı çalışma alanı BAŞINA geçerlidir. */
export const requestRoutineForAllSchema = strict(routineFields).superRefine((input, ctx) => {
  const problem = jobApprovalProblem("routine", input.dryRun === true, input.approval);
  if (problem !== undefined) ctx.addIssue({ code: "custom", message: problem, path: ["approval"] });
  const credits = jobCreditsProblem("routine", input.dryRun === true, input.maxCredits);
  if (credits !== undefined) ctx.addIssue({ code: "custom", message: credits, path: ["maxCredits"] });
});

/** İş kimliği taşıyan action girdisi (iptal). Kimlik biçimi depoda çözülür (biçimsiz → bulunamadı). */
export const jobIdSchema = strict({
  jobId: z.string({ error: "İş kimliği metin olmalı." }).trim().min(1, "İş kimliği boş olamaz.").max(100, "İş kimliği çok uzun."),
});

/** Satıra yazılacak USD onayı: kullanıcının verdiği (`JobApprovalInput`) ya da başlangıç işinde sunucunun kurduğu sabit tavanlı onay. */
export type ParsedJobApproval = JobApprovalInput | { basis: "onboarding"; maxUsd: number };

/** Doğrulanmış ve normalleştirilmiş istek: `panel_jobs` satırına birebir yazılır (`kind`, `dry_run`, `params`, onay alanları). */
export interface ParsedJobRequest {
  kind: JobKind;
  dryRun: boolean;
  /** Para DIŞI parametreler; verilmeyen alan yoktur (boş nesne geçerli). */
  params: JobParams;
  approval?: ParsedJobApproval;
  /** İsteyenin onayladığı kredi tavanı (verildiyse). Ayrılacak tutar `jobCreditHold` ile hesaplanır. */
  maxCredits?: number;
}

/** Depo uygulamaları için: geçersiz girdi `RepositoryError("invalid_input")` fırlatır; normalleştirilmiş isteği döndürür. */
export function parseRequestJobInput(input: unknown): ParsedJobRequest {
  const parsed = parseOrThrow<RequestJobInput>(requestJobSchema, input, "Geçersiz iş isteği.");
  if (parsed.kind === "ads_sync" && isCopyEdition()) throw new RepositoryError("invalid_state", "Bu sürümde reklam verisi okunmaz.");
  if (parsed.kind === "onboarding") {
    // Tavan girdiden gelmez: aşamanın sabit tavanı. Rakip listesi yalnız ilk turda ve yalnız doluysa yazılır.
    const rivalIds = parsed.phase === "build" ? parsed.rivalIds : undefined;
    return {
      kind: "onboarding",
      dryRun: false,
      params: { phase: parsed.phase, ...(rivalIds === undefined || rivalIds.length === 0 ? {} : { rivalIds }) },
      approval: { basis: "onboarding", maxUsd: ONBOARDING_PHASE_SPEC[parsed.phase].maxUsd },
    };
  }
  const approval = "approval" in parsed ? parsed.approval : undefined;
  const params: JobParams = {
    ...("limit" in parsed && parsed.limit !== undefined ? { limit: parsed.limit } : {}),
    ...("week" in parsed && parsed.week !== undefined ? { week: parsed.week } : {}),
    ...("slot" in parsed && parsed.slot !== undefined ? { slot: parsed.slot } : {}),
    ...("ideaId" in parsed && parsed.ideaId !== undefined ? { ideaId: parsed.ideaId } : {}),
    ...("source" in parsed && parsed.source !== undefined ? { source: parsed.source } : {}),
  };
  return {
    kind: parsed.kind,
    dryRun: "dryRun" in parsed && parsed.dryRun === true,
    params,
    ...(approval === undefined ? {} : { approval }),
    ...("maxCredits" in parsed && parsed.maxCredits !== undefined ? { maxCredits: parsed.maxCredits } : {}),
  };
}

/**
 * Bu istek için AYRILACAK kredi (depo uygulamalarının ortak kuralı). Zorlama kapalıysa, önizlemede ve kredi harcamayan türde undefined:
 * ayırma yapılmaz, satıra kredi onayı yazılmaz (zorlama öncesi davranış). Açıksa türün güvenli üst sınırı, isteyenin onayladığı daha düşük
 * tutarla sınırlanır. Haftalık turda hesap taraması yalnız USD onayı verildiyse sayılır (onaysız tur toplama yapmaz). Başlangıç işinde
 * tavan aşamanın sabit kredi tavanıdır.
 */
export function jobCreditHold(request: Pick<ParsedJobRequest, "kind" | "dryRun" | "approval" | "maxCredits" | "params">, enforced: boolean): number | undefined {
  if (!enforced || request.dryRun) return undefined;
  return jobHoldCredits(request.kind, { collects: request.approval !== undefined, approved: request.maxCredits, phase: request.params.phase });
}

/**
 * Onay, çalışma alanının ŞU ANKİ tavan durumunda kullanılabilir mi (`availableApprovalBases`): aylık tavan onaysızken `monthly_cap`,
 * ölçüm kapalıyken (tavan 0) ölçüm onayı, Apify harcaması kapalıyken herhangi bir onay → `invalid_input`. Onaysız istekte denetim yok.
 * Depo uygulamaları `parseRequestJobInput`'tan SONRA, satırı yazmadan önce çağırır.
 */
export function assertJobApprovalAllowed(request: Pick<ParsedJobRequest, "kind" | "approval">, caps: JobSpendCaps): void {
  if (request.approval === undefined) return;
  // Ajan tavanı dayanağı: ilgili tavan ONAYLI ve > 0 ise açık (insan dayanaklarının listesi değişmez).
  if (request.approval.basis === "monthly_cap" && AGENT_CAP_KINDS.includes(request.kind)) {
    if (caps.agentMonthlyCapUsd !== undefined && caps.agentMonthlyCapUsd > 0) return;
    throw new RepositoryError("invalid_input", "Ajan tavanı onaylı değil ya da kapalı: aylık tavan dayanağıyla iş açılamaz.");
  }
  const available = availableApprovalBases(request.kind, caps);
  if (available.includes(request.approval.basis)) return;
  const message =
    available.length === 0
      ? "Bu iş için harcama şu an kapalı (aylık tavan 0). Ayarlar'dan tavanı aç."
      : "Aylık tavan onaylı değil: bu iş için tutar onayı gerekir.";
  throw new RepositoryError("invalid_input", message);
}
