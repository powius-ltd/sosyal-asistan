import { describe, expect, it } from "vitest";

import { deriveCycle } from "@/lib/cycle/derive";
import type { CycleFacts, CycleStepId } from "@/lib/cycle/types";

const NOW = new Date("2026-10-20T09:00:00.000Z");
const daysAgo = (days: number): string => new Date(NOW.getTime() - days * 86_400_000).toISOString();

/** Yapılacak işi olan hesap: toplama eski (para), inceleme / etiket bekliyor, plan yok, ölçüm eski. */
const busy = (overrides: Partial<CycleFacts> = {}): CycleFacts => ({
  workspaceId: "ws-1", accountType: "business", ownAccounts: 1, trackedRivals: 3, contentCount: 30, lastCollectedAt: daysAgo(30), pendingAnalysis: 4, analyzedCount: 26,
  pendingLabels: 2, nextWeekPlan: false, thisWeekPlan: true, ownContentCount: 10, lastMeasuredAt: daysAgo(3), zernioKey: true, jobs: [], nextWeekStart: "2026-10-26", ...overrides,
});

const step = (facts: CycleFacts, id: CycleStepId) => deriveCycle(facts, NOW).steps.find((s) => s.id === id);

describe("halka: otomatik iş anahtarları", () => {
  it("anahtar yokken (eski çağıran) ve açıkken iş açılır", () => {
    for (const facts of [busy(), busy({ autoWeeklyPlan: true, autoMeasure: true })]) {
      expect(step(facts, "collect")?.status).toBe("needs_approval");
      expect(step(facts, "analyze")?.status).toBe("due");
      expect(step(facts, "label")?.status).toBe("due");
      expect(step(facts, "plan")?.status).toBe("due");
      expect(step(facts, "measure")).toMatchObject({ status: "due", jobKind: "measure_zernio" });
    }
  });

  it("haftalık plan kapalı: toplama / inceleme / etiket / plan engelli, iş türü yok; ölçüm etkilenmez", () => {
    const facts = busy({ autoWeeklyPlan: false });
    for (const id of ["collect", "analyze", "label", "plan"] as const) {
      const s = step(facts, id);
      expect(s?.status, id).toBe("blocked");
      expect(s?.jobKind, id).toBeUndefined();
      expect(s?.reason).toContain("kapalı");
    }
    expect(step(facts, "measure")?.status).toBe("due");
    expect(deriveCycle(facts, NOW).next).toBe("measure");
  });

  it("ölçüm kapalı: measure_zernio açılmaz; plan zinciri sürer", () => {
    const facts = busy({ autoMeasure: false });
    expect(step(facts, "measure")).toMatchObject({ status: "blocked" });
    expect(step(facts, "measure")?.jobKind).toBeUndefined();
    expect(step(facts, "collect")?.status).toBe("needs_approval");
  });

  it("tamamlanmış (done) adım kapalı anahtarla engelli görünmez", () => {
    const facts = busy({ autoWeeklyPlan: false, lastCollectedAt: daysAgo(1), pendingAnalysis: 0, pendingLabels: 0, nextWeekPlan: true });
    for (const id of ["collect", "analyze", "label", "plan"] as const) expect(step(facts, id)?.status, id).toBe("done");
  });

  it("her ikisi kapalıyken sıradaki adım yok", () => {
    expect(deriveCycle(busy({ autoWeeklyPlan: false, autoMeasure: false }), NOW).next).toBeUndefined();
  });
});
