import { describe, expect, it } from "vitest";

import { deriveCycle } from "@/lib/cycle/derive";
import type { CycleFacts, CycleStepId } from "@/lib/cycle/types";

const NOW = new Date("2026-10-20T09:00:00.000Z");
const daysAgo = (days: number): string => new Date(NOW.getTime() - days * 86_400_000).toISOString();

const fresh = (overrides: Partial<CycleFacts> = {}): CycleFacts => ({
  workspaceId: "ws-1", accountType: "business", ownAccounts: 1, trackedRivals: 3, contentCount: 30, lastCollectedAt: daysAgo(2), pendingAnalysis: 0, analyzedCount: 30,
  pendingLabels: 0, nextWeekPlan: true, thisWeekPlan: true, ownContentCount: 10, lastMeasuredAt: daysAgo(0), zernioKey: true, jobs: [], nextWeekStart: "2026-10-26", ...overrides,
});

const step = (facts: CycleFacts, id: CycleStepId) => deriveCycle(facts, NOW).steps.find((s) => s.id === id);

describe("halka ayarı: toplama sıklığı (collect_every_days)", () => {
  it("14 günde done, 15 günde needs_approval (collect)", () => {
    expect(step(fresh({ collectEveryDays: 14, lastCollectedAt: daysAgo(14) }), "collect")?.status).toBe("done");
    const late = step(fresh({ collectEveryDays: 14, lastCollectedAt: daysAgo(15) }), "collect");
    expect(late).toMatchObject({ status: "needs_approval", jobKind: "collect" });
  });

  it("ayar yoksa 7 gün yedek eşiği geçerli (eski davranış)", () => {
    expect(step(fresh({ lastCollectedAt: daysAgo(7) }), "collect")?.status).toBe("done");
    expect(step(fresh({ lastCollectedAt: daysAgo(8) }), "collect")?.status).toBe("needs_approval");
  });

  it("sıklık 3 gün ise 4. günde ister", () => {
    expect(step(fresh({ collectEveryDays: 3, lastCollectedAt: daysAgo(4) }), "collect")?.status).toBe("needs_approval");
  });
});

describe("halka ayarı: hedef rakip (rival_target)", () => {
  it("hedefe ulaşıldı → done", () => {
    expect(step(fresh({ trackedRivals: 3, rivalTarget: 3 }), "rivals")?.status).toBe("done");
  });

  it("2/3 izleniyor ve aday yok → needs_approval discover", () => {
    expect(step(fresh({ trackedRivals: 2, rivalTarget: 3, pendingCandidates: 0 }), "rivals")).toMatchObject({ status: "needs_approval", jobKind: "discover" });
  });

  it("2/3 izleniyor ve bekleyen aday var → blocked (adayları seç), discover açılmaz", () => {
    const rivals = step(fresh({ trackedRivals: 2, rivalTarget: 3, pendingCandidates: 4 }), "rivals");
    expect(rivals?.status).toBe("blocked");
    expect(rivals?.jobKind).toBeUndefined();
    expect(rivals?.reason).toContain("Rakipler");
  });

  it("hedef 0 → rakipsiz hesap done", () => {
    expect(step(fresh({ trackedRivals: 0, rivalTarget: 0 }), "rivals")?.status).toBe("done");
  });

  it("hiç rakip yok ve aday yok → discover; kendi hesap yoksa blocked", () => {
    expect(step(fresh({ trackedRivals: 0, rivalTarget: 3 }), "rivals")).toMatchObject({ status: "needs_approval", jobKind: "discover" });
    expect(step(fresh({ ownAccounts: 0, trackedRivals: 0, rivalTarget: 3 }), "rivals")?.status).toBe("blocked");
  });

  it("içerik üreticisi: rakipsiz plan geçerli (hedef 3 olsa da hiç rakip yokken done)", () => {
    expect(step(fresh({ accountType: "creator", trackedRivals: 0, rivalTarget: 3 }), "rivals")?.status).toBe("done");
  });

  it("ayar yoksa eski kural: en az 1 rakip yeter", () => {
    expect(step(fresh({ trackedRivals: 1 }), "rivals")?.status).toBe("done");
    expect(step(fresh({ trackedRivals: 0 }), "rivals")?.status).toBe("needs_approval");
  });
});
