/**
 * Başlangıç akışının İŞİ (`panel_jobs.kind = 'onboarding'`, migration 0021; plan `docs/BASLANGIC-AKISI-PLAN.md` §3): aşamalar, SABİT harcama
 * tavanları, deneme sınırları, aşamanın adımları ve `probe` işinin çıktısı. Akışın ADIMI (hangi ekran) burada değil `onboarding.ts`'tedir.
 * Saf dosya (sunucu + istemci). Tür tablosu, onay dayanağı ve sonuç kodları `panel-job.ts`'te; jsonb zod sözleşmesi `lib/data/job-schema.ts`.
 *
 * İki aşama, iki iş satırı (arada kullanıcı kararı var; onay iş açılırken yazılır ve değişmez):
 *  - `probe` ("hesaba bakış"): profil doğrulama → kendi son videoları → rakip adayları → konu taslağı. Kullanıcının "Devam et"i onaydır.
 *  - `build` ("ilk tur"): seçilen rakipler dahil toplama → inceleme → etiket / kümeleme → plan → notlar. Kullanıcının "Başlat"ı onaydır.
 * TAVAN GİRDİDEN GELMEZ: sunucu `ONBOARDING_PHASE_SPEC[phase].maxUsd`'yi yazar, DB tam eşitlik ister. Değişirse migration + bu tablo birlikte.
 */
import type { AccountType } from "@/lib/domain/account-type";
import type { JobParams, JobStepId } from "@/lib/domain/panel-job";
import type { Platform } from "@/lib/platforms/types";

export const ONBOARDING_PHASES = ["probe", "build"] as const;
export type OnboardingPhase = (typeof ONBOARDING_PHASES)[number];

export interface OnboardingPhaseSpec {
  /** Onaylı SABİT harcama tavanı (USD; DB check ile birebir). İşçi bundan fazlasını harcatacak hiçbir koşuyu başlatmaz. */
  maxUsd: number;
  /** Kredi tavanı (yalnız kredi zorlaması açıkken ayrılır; DB check üst sınırı). */
  maxCredits: number;
  /** Çalışma alanı başına bu aşamadan en çok kaç iş satırı (iptal / hata dahil; DB trigger'ı ile birebir). */
  attemptsMax: number;
  /** Aşamanın süre tavanı (dk). Türün tavanı (`JOB_KIND_SPEC.onboarding.timeoutMinutes`) bunların en büyüğüdür. */
  timeoutMinutes: number;
  /** Aşamanın adımları, koşu sırasıyla (`JOB_STEPS_BY_KIND.onboarding` ikisinin birleşimidir). */
  steps: readonly JobStepId[];
}

/**
 * Aşama tablosu. Karar (kullanıcı, 2026-10-13): hesap başına BİR KEZ, toplam 0,60 USD (`ONBOARDING_TOTAL_MAX_USD`) ve zorlama açıksa 300 kredi.
 * Bölüşüm: `probe` 0,20 USD (kendi hesap ≈ 0,07 + aday keşfi ≈ 0,10), `build` 0,40 USD (kendi + 3 rakip ≈ 0,27). Kredi: `probe` bir hesaba
 * bakış, `build` 300.
 */
export const ONBOARDING_PHASE_SPEC: Record<OnboardingPhase, OnboardingPhaseSpec> = {
  probe: { maxUsd: 0.2, maxCredits: 10, attemptsMax: 3, timeoutMinutes: 10, steps: ["verify", "collect", "discover", "draft_niche"] },
  build: { maxUsd: 0.4, maxCredits: 300, attemptsMax: 2, timeoutMinutes: 60, steps: ["collect", "analyze", "label", "cluster", "plan", "briefing"] },
};

/** Hesap başına başlangıç harcamasının toplam tavanı (USD): aşama tavanlarının toplamı (testle eşit tutulur). */
export const ONBOARDING_TOTAL_MAX_USD = 0.6;
/** İlk turda hesap başına çekilen video sayısı (haftalık tur 10 çeker; baz çizgisi n < 10'da düşük güvenlidir). */
export const ONBOARDING_COLLECT_LIMIT = 25;
/** İlk turda incelenen video sayısı (tek parti; kalanı haftalık tura). */
export const ONBOARDING_ANALYZE_LIMIT = 19;
/** Bundan az videosu olan hesapta akış uyarıyla sürer (`few_videos`): sonuçlar düşük güvenlidir. 0 video akışı durdurur (`no_videos`). */
export const ONBOARDING_LOW_DATA_VIDEOS = 10;
/** Rakip ekranında ön seçili önerilen aday sayısı. */
export const ONBOARDING_RIVALS_PRESELECT = 3;
/** "Başlat" ile izlemeye alınabilecek en çok rakip (maliyet tablosu 1 kendi + 3 rakip içindir). 0 = rakipsiz, geçerli yol. */
export const ONBOARDING_RIVALS_MAX = 3;
/** `probe` çıktısındaki metin sınırları (karakter). */
export const ONBOARDING_BIO_MAX_CHARS = 500;
export const ONBOARDING_NICHE_DRAFT_MAX_CHARS = 600;

/** İşin aşaması; `onboarding` değilse ya da aşama bozuksa undefined. */
export function onboardingPhaseOf(job: { kind: string; params: Pick<JobParams, "phase"> }): OnboardingPhase | undefined {
  return job.kind === "onboarding" ? ONBOARDING_PHASES.find((phase) => phase === job.params.phase) : undefined;
}

/** Aşamanın adımları, koşu sırasıyla (ilerleme ekranı ve işçi AYNI listeyi kullanır). */
export function onboardingStepsOf(phase: OnboardingPhase): readonly JobStepId[] {
  return ONBOARDING_PHASE_SPEC[phase].steps;
}

// ------------------------------------------------------------- probe çıktısı

/** Hesabın herkese açık profil özeti ("bu sen misin?" ekranı). Ölçülemeyen alan yoktur (0 değil). Fotoğraf adresi TAŞINMAZ (süreli CDN). */
export type OnboardingProfileSummary = {
  platform: Platform;
  handle: string;
  displayName?: string;
  bio?: string;
  followers?: number;
  /** Profilde görünen toplam gönderi sayısı (toplanan video sayısı değil). */
  postsCount?: number;
  isVerified?: boolean;
};

/** Bulunan rakip adaylarının özeti (satırlar `listDiscoveryCandidates`'ten okunur). `similarSize` ölçülemediyse yok. */
export type OnboardingCandidateSummary = {
  total: number;
  /** Takipçisi kendi hesabın ±3 katı aralığında olan aday sayısı. */
  similarSize?: number;
};

/**
 * `probe` işinin çıktısı (`JobResult.probe`). Gizli / bulunamayan hesapta YAZILMAZ (iş `blocked` + sonuç kodu). `videoCount` toplanan kısa
 * video sayısıdır; toplama hiç koşmadıysa yok (0 değil). `suggestedAccountType` yalnız ÖN SEÇİMDİR (tür ataması kullanıcı kararıdır);
 * `nicheDraft` konu taslağıdır (kullanıcı düzeltir ya da boş geçer).
 */
export type OnboardingProbeResult = {
  profile: OnboardingProfileSummary;
  videoCount?: number;
  candidates?: OnboardingCandidateSummary;
  suggestedAccountType?: AccountType;
  nicheDraft?: string;
};
