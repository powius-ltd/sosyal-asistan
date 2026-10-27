/**
 * Haftalık tur önizlemesinin birim sayıları (kredi tahmininin girdisi; `domain/credit-pricing.ts` `estimateJobCredits("routine", …)`).
 * Tahmin "EN ÇOK"tur: onay verilirse koşacak adımlar koşacakmış gibi sayılır.
 *  - accounts: toplama atlanmıyorsa (koşacak ya da onay bekliyor) taranacak hesap sayısı; atlanıyorsa 0. Sayı okunamadıysa alan YOKTUR
 *    (tahmin "bilinmiyor" çıkar, 0 değil).
 *  - videos: toplama koşabilecekse inceleme tavanı (yeni içerik tavanı doldurabilir); yalnız inceleme koşacaksa seçilebilir video sayısı
 *    (tavanla sınırlı); ikisi de değilse 0.
 *  - measureRuns: 0. Turdaki ölçüm adımı ücretsiz kontroldür (ücretli ölçüm ayrı iştir).
 * Saf fonksiyon.
 */
import type { CreditUnits } from "@/lib/domain/credit-pricing";
import { DEFAULT_ANALYZE_LIMIT } from "@/lib/intel/analysis-select";
import type { RoutinePlan, RoutineState, RoutineStepId } from "@/lib/orchestrator/types";

/** Planda toplama adımı atlanmıyor mu (hesap sayısını okumaya değer mi). */
export function routineMayCollect(plan: RoutinePlan): boolean {
  const collect = plan.find((entry) => entry.step === "collect");
  return collect !== undefined && collect.decision.action !== "skip";
}

export function routinePreviewUnits(plan: RoutinePlan, state: Pick<RoutineState, "analysis"> | undefined, accountCount: number | undefined): CreditUnits {
  const action = (step: RoutineStepId) => plan.find((entry) => entry.step === step)?.decision.action;
  const collects = routineMayCollect(plan);
  const selectable = state?.analysis.selectable;
  const videos = collects ? DEFAULT_ANALYZE_LIMIT : action("analyze") === "run" ? (selectable === undefined ? undefined : Math.min(selectable, DEFAULT_ANALYZE_LIMIT)) : 0;
  const accounts = collects ? accountCount : 0;
  return { ...(accounts === undefined ? {} : { accounts }), ...(videos === undefined ? {} : { videos }), measureRuns: 0 };
}
