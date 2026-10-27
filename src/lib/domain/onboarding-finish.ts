/**
 * Başlangıç işi BİTİNCE kullanıcıya ne söylenir (saf; sunucu + istemci): aynı karar üç yerde kullanılır — işçinin yazdığı kalıcı bildirim
 * (zil), açık sekmedeki baloncuk / sekme başlığı ve tarayıcı bildirimi. Karar yalnız aşamadan, iş durumundan ve sonuç kodundan çıkar
 * (görünüm `JobStatusView` da bunları taşır); metinler `plain-language-onboarding.ts`'te.
 *
 * Kullanıcının kendi durdurduğu (`cancelled`) ve hâlâ süren iş için bildirim yoktur: kullanıcı zaten ne olduğunu bilir.
 */
import { onboardingPhaseOf, type OnboardingPhase } from "@/lib/domain/onboarding-job";
import { isActiveJobStatus, type JobOutcomeCode, type JobStatus } from "@/lib/domain/panel-job";

/**
 * probe_ready: hesaba bakış bitti, sıra kullanıcıda · probe_stopped: bakış yapılamadı (gizli, bulunamadı, videosuz, hata) · build_ready:
 * ilk plan hazır · build_partial: plan hazır ama bazı adımlar tamamlanamadı · build_no_plan: videolar incelendi, plan çıkmadı ·
 * build_stopped: ilk inceleme hiçbir şey üretemeden durdu.
 */
export const ONBOARDING_FINISH_KINDS = ["probe_ready", "probe_stopped", "build_ready", "build_partial", "build_no_plan", "build_stopped"] as const;
export type OnboardingFinishKind = (typeof ONBOARDING_FINISH_KINDS)[number];

export interface OnboardingFinishInput {
  /** Aşama; başlangıç işi değilse undefined (bildirim yok). */
  phase: OnboardingPhase | undefined;
  status: JobStatus;
  outcome?: JobOutcomeCode;
}

/** İş satırından girdi (işçi): aşama `params.phase`'ten, sonuç kodu işin son hâlinden. */
export function onboardingFinishInputOf(job: Parameters<typeof onboardingPhaseOf>[0], final: { status: JobStatus; result?: { outcome?: JobOutcomeCode } }): OnboardingFinishInput {
  return { phase: onboardingPhaseOf(job), status: final.status, ...(final.result?.outcome === undefined ? {} : { outcome: final.result.outcome }) };
}

/**
 * Bitiş türü; bildirim gerektirmeyen durumda undefined. `build` kısmi bitişte `plan_not_ready` dışındaki her sonuç (adım düştü, kredi bitti)
 * planın hazır olduğu anlamına gelir (plan hazırsa kısmi yalnız bu yollardan çıkar: `buildFinal`, `withCreditVerdict`).
 */
export function onboardingFinishKindOf(input: OnboardingFinishInput): OnboardingFinishKind | undefined {
  const { phase, status, outcome } = input;
  if (phase === undefined || isActiveJobStatus(status) || status === "cancelled") return undefined;
  if (phase === "probe") return status === "succeeded" || status === "partial" ? "probe_ready" : "probe_stopped";
  if (status === "succeeded") return "build_ready";
  if (status === "partial") return outcome === "plan_not_ready" ? "build_no_plan" : "build_partial";
  return "build_stopped";
}

/** Bildirimin tekrarsızlık anahtarı: aynı iş için bir kez (`notifications (workspace_id, dedupe_key)` benzersiz indeksi). */
export const onboardingFinishDedupeKey = (jobId: string): string => `onboarding:${jobId}`;
