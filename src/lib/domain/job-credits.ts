/**
 * Panel işi ↔ kredi (Dilim 3; plan `docs/KREDI-PLAN.md` §4, §6): işin EN ÇOK kaç kredi tutabileceği (istekte ayrılan tavan), ayırma anahtarı
 * ve yapılan birimlerin tutarı. Saf dosya (sunucu + istemci); fiyatlar `credit-pricing.ts`'ten, defter kuralları `credits.ts`'ten gelir.
 *
 * GÜVENLİ ÜST SINIR: iş istenirken işlenecek birim sayısı kesin bilinmez (kaç hesap taranacak, kaç video seçilecek). Bu yüzden tavan, türün
 * birim tavanlarıyla hesaplanır (`JOB_CREDIT_UNIT_CAPS`): iş bundan fazlasını harcayamaz, bitince yalnız YAPILAN birim düşülür ve fark
 * serbest kalır. İsteyen daha düşük bir tavan onaylayabilir (`maxCredits`; ör. önizlemenin tahmini): işçi ayrılan krediye sığmayan adımı
 * hiç başlatmaz, yarıda biterse iş adım / video sınırında durur.
 */
import { creditsFor, estimateJobCredits, type CreditItem, type CreditUnits } from "@/lib/domain/credit-pricing";
import type { CreditChargeUnits } from "@/lib/domain/credits";
import { ONBOARDING_ANALYZE_LIMIT, ONBOARDING_PHASE_SPEC, ONBOARDING_RIVALS_MAX, type OnboardingPhase } from "@/lib/domain/onboarding-job";
import type { JobKind } from "@/lib/domain/panel-job";

/**
 * Tür başına birim tavanları (tek işte en çok). `videos` video incelemenin panel tavanıdır (`DEFAULT_ANALYZE_LIMIT`, testle eşit tutulur);
 * `accounts` tek toplamada taranabilecek en çok hesap (kendi + izlenen rakipler); `measureRuns` tek ölçümde en çok kendi hesap.
 */
export const JOB_CREDIT_UNIT_CAPS: Required<CreditUnits> = { accounts: 25, videos: 19, measureRuns: 3 };

/** Türün "en çok" birimleri. Haftalık turda hesap taraması yalnız tur toplama yapacaksa (`collects`: USD onayı var) sayılır. */
function ceilingUnits(kind: JobKind, collects: boolean): CreditUnits {
  const caps = JOB_CREDIT_UNIT_CAPS;
  switch (kind) {
    case "collect":
      return { accounts: caps.accounts };
    case "measure":
      return { measureRuns: caps.measureRuns };
    case "analyze":
      return { videos: caps.videos };
    case "routine":
      return { accounts: collects ? caps.accounts : 0, videos: caps.videos, measureRuns: 0 };
    case "onboarding":
      // İlk turun dökümü (kendi hesap + en çok rakip, tek parti inceleme); AYRILAN tutar aşamanın sabit tavanıdır (`jobCreditCeiling`).
      return { accounts: 1 + ONBOARDING_RIVALS_MAX, videos: ONBOARDING_ANALYZE_LIMIT };
    case "discover":
      return { accounts: caps.accounts };
    case "label":
    case "plan":
    case "briefing":
    case "measure_zernio":
    case "order":
    case "order_return":
    case "publish":
    case "ads_sync":
      return {};
  }
}

/**
 * İşin kredi tavanı (güvenli üst sınır). 0 = bu tür kredi harcamaz (`label`: açı etiketi video incelemesinin içindedir): ayırma yapılmaz,
 * kredi onayı aranmaz. `collects`: haftalık tur toplama da yapacak mı (USD onayı verildi mi). Başlangıç işinde tavan birimlerden
 * hesaplanmaz: aşamanın SABİT kredi tavanıdır (`ONBOARDING_PHASE_SPEC`; aşama verilmezse ilk turunki).
 */
export function jobCreditCeiling(kind: JobKind, options: { collects?: boolean; phase?: OnboardingPhase } = {}): number {
  if (kind === "onboarding") return ONBOARDING_PHASE_SPEC[options.phase ?? "build"].maxCredits;
  return estimateJobCredits(kind, ceilingUnits(kind, options.collects === true))?.maxCredits ?? 0;
}

/** Bu tür kredi harcar mı (tavanı > 0). */
export function jobSpendsCredits(kind: JobKind): boolean {
  return jobCreditCeiling(kind, { collects: true }) > 0;
}

/**
 * İstekte ayrılacak kredi: tavan, isteyenin onayladığı daha düşük tutarla sınırlanır. Kredi harcamayan türde undefined (ayırma yok).
 * `approved` tavanı AŞAMAZ (aşan değer tavana iner): güvenli üst sınırdan fazlası hiçbir işte ayrılmaz.
 */
export function jobHoldCredits(kind: JobKind, options: { collects?: boolean; approved?: number; phase?: OnboardingPhase } = {}): number | undefined {
  const ceiling = jobCreditCeiling(kind, options);
  if (ceiling <= 0) return undefined;
  return options.approved === undefined ? ceiling : Math.min(options.approved, ceiling);
}

/** İşin kredi ayırmasının idempotency anahtarı (DB `request_panel_job_credited` ile AYNI biçim). */
export const jobCreditKey = (jobId: string): string => `job:${jobId}`;

/** Yapılan birimlerin tutarı (kalem × birim fiyat toplamı). Geçersiz sayı içeren kalem sayılmaz. */
export function chargeOf(units: CreditChargeUnits): number {
  return (Object.entries(units) as [CreditItem, number | undefined][]).reduce((sum, [item, count]) => sum + (count === undefined ? 0 : (creditsFor(item, count) ?? 0)), 0);
}
