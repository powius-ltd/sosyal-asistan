/** Orkestratör testleri için ortak durum/bağımlılık kurucuları (yalnız testler import eder). */
import type { PlanEntry, RoutineState, StepOutput } from "@/lib/orchestrator/types";

export const NOW = "2026-10-01T09:00:00.000Z";

/** Her şeyin "yapılacak iş var" olduğu temel durum; testler alan alan değiştirir. */
export function baseState(overrides: Partial<RoutineState> = {}): RoutineState {
  return {
    now: NOW,
    accountType: "business",
    planWeek: "2026-10-05",
    collection: { lastCollectedAt: "2026-09-20T10:00:00.000Z", referenceUsd: 0.27, newContentSinceBriefing: 0 },
    analysis: { selectable: 12 },
    labeling: { eligible: 3 },
    clustering: { available: true, clusteredCount: 12, unclusteredCount: 0 },
    plan: { exists: false },
    measurement: { dueCount: 0, capApproved: false },
    briefing: { generatedAt: "2026-09-20T10:00:00.000Z", freshness: { stale: true, reason: "too_old" } },
    ...overrides,
  };
}

export const ok = (reason = "tamam", extra: Partial<StepOutput> = {}): StepOutput => ({ status: "ok", reason, ...extra });

export function actionOf(plan: readonly PlanEntry[], step: PlanEntry["step"]): string {
  const entry = plan.find((e) => e.step === step);
  if (entry === undefined) throw new Error(`adım yok: ${step}`);
  return entry.decision.action;
}
