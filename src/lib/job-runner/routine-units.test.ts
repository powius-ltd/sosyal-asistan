import { describe, expect, it } from "vitest";

import { estimateJobCredits } from "@/lib/domain/credit-pricing";
import { DEFAULT_ANALYZE_LIMIT } from "@/lib/intel/analysis-select";
import { routineMayCollect, routinePreviewUnits } from "@/lib/job-runner/routine-units";
import { planRoutine } from "@/lib/orchestrator/plan-routine";
import { baseState } from "@/lib/orchestrator/test-support";

const NOW = "2026-10-12T09:00:00.000Z";
/** Toplama taze (atlanır). */
const fresh = { lastCollectedAt: "2026-10-12T06:00:00.000Z", referenceUsd: 0.27, newContentSinceBriefing: 0 };

describe("haftalık tur önizlemesi: birim sayıları", () => {
  it("toplama onay bekliyorsa: hesap sayısı + inceleme tavanı (yeni içerik tavanı doldurabilir)", () => {
    const state = baseState({ now: NOW, analysis: { selectable: 3 } });
    const plan = planRoutine(state);
    expect(routineMayCollect(plan)).toBe(true);
    expect(routinePreviewUnits(plan, state, 4)).toEqual({ accounts: 4, videos: DEFAULT_ANALYZE_LIMIT, measureRuns: 0 });
  });

  it("toplama atlanıyorsa: hesap 0, video = seçilebilir (tavanla sınırlı)", () => {
    const few = baseState({ now: NOW, collection: fresh, analysis: { selectable: 3 } });
    expect(routineMayCollect(planRoutine(few))).toBe(false);
    expect(routinePreviewUnits(planRoutine(few), few, undefined)).toEqual({ accounts: 0, videos: 3, measureRuns: 0 });
    const many = baseState({ now: NOW, collection: fresh, analysis: { selectable: 500 } });
    expect(routinePreviewUnits(planRoutine(many), many, undefined).videos).toBe(DEFAULT_ANALYZE_LIMIT);
    const none = baseState({ now: NOW, collection: fresh, analysis: { selectable: 0 } });
    expect(routinePreviewUnits(planRoutine(none), none, undefined).videos).toBe(0);
  });

  it("hesap sayısı okunamadıysa alan yazılmaz: kredi tahmini bilinmiyor çıkar (0 değil)", () => {
    const state = baseState({ now: NOW });
    const units = routinePreviewUnits(planRoutine(state), state, undefined);
    expect("accounts" in units).toBe(false);
    expect(estimateJobCredits("routine", units)).toBeUndefined();
  });

  it("birim sayıları tur için kredi tahmini verir (en çok): hesap + video + plan + notlar", () => {
    const state = baseState({ now: NOW, collection: fresh, analysis: { selectable: 5 } });
    const estimate = estimateJobCredits("routine", routinePreviewUnits(planRoutine(state), state, undefined));
    expect(estimate?.maxCredits).toBe(5 * 10 + 60 + 4);
  });
});
