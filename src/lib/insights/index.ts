/**
 * `lib/insights` dışa açılan yüzey: LLM'siz haftalık plan taslağı (`buildPlanDraft`) ve girdi/çıktı tipleri. Kural eşikleri
 * `constants.ts`'te, bölümler kendi dosyalarındadır (winners, focus, schedule, avoid, candidates). Saf fonksiyonlar: DB/ağ/saat yok.
 */
export { audienceZone } from "@/lib/insights/audience-zone";
export { applyFeedbackNotes, buildFeedback, FEEDBACK_MIN_N, previousWeeks, type FeedbackIndex, type FeedbackReview } from "@/lib/insights/feedback";
export { BASIS_LABEL, type PlanMode } from "@/lib/insights/mode";
export { buildPlanDraft } from "@/lib/insights/plan-draft";
export { slotPurposes, type SlotPurpose } from "@/lib/insights/slot-mix";
export type { AnalysisRef, PlanCandidate, PlanDraftInput, PlanDraftStats, TopicCluster, WeeklyPlanDraft } from "@/lib/insights/types";
