/**
 * Baz çizgisi kuralı (sabitlenmiş ve <3 günlük içerik baz çizgisine girmez) plan/içgörü hesabına GERÇEK skorla yansır:
 * lift'ler `scoreAccount`tan gelir (elle yazılmaz), olgunlaşmamış video grup özetlerine ve tutanlara girmez.
 */
import { describe, expect, it } from "vitest";

import { buildInsights } from "@/lib/data/views/insights";
import { buildPlanDraft } from "@/lib/insights/plan-draft";
import { buildItems, FIXTURE_COMPETITORS, FIXTURE_NOW, FIXTURE_OWN, FIXTURE_WORKSPACE, NEXT_WEEK, type FixtureAccount, type FixtureSpec } from "@/lib/insights/testing/faz2-fixture";

const old = (id: string, daysAgo: number): FixtureSpec => ({ id, daysAgo, hourEt: 10, dur: 100, lift: 1, caption: "Quiet." });
const account: FixtureAccount = {
  owner: { kind: "competitor", id: "rv-noelle", handle: "noelle", followers: 100_000 },
  medianViews: 1_000,
  specs: [
    ...[8, 9, 10, 11, 12, 13].map((d, i) => old(`o${i + 1}`, d)),
    { id: "pin", daysAgo: 20, hourEt: 10, dur: 100, lift: 50, pinned: true },
    { id: "young", hoursAgo: 20, dur: 100, lift: 40 },
    { id: "target", daysAgo: 6, hourEt: 10, dur: 100, lift: 2 },
  ],
};
const items = buildItems([account]);
const byId = (id: string) => items.find((c) => c.id === id);

describe("baz çizgisi: sabitlenmiş ve <3 günlük içerik hariç", () => {
  it("hedefin baz çizgisi yalnız olgun, sabitlenmemiş 6 videodan: sabitlenmiş (50x) ve genç (40x) videolar medyanı bozmaz", () => {
    const target = byId("target");
    expect(target?.score).toMatchObject({ baselineN: 6, baselineViews: 1_000 });
    expect(target?.score.lift).toBeCloseTo(2, 9);
    expect(byId("o1")?.score.lift).toBeCloseTo(1, 9);
    expect(byId("young")?.score.immature).toBe(true);
    expect(byId("pin")?.isPinned).toBe(true);
  });

  const input = { workspace: FIXTURE_WORKSPACE, own: FIXTURE_OWN, competitors: FIXTURE_COMPETITORS, items, now: FIXTURE_NOW };

  it("grup özeti: n tüm videoları sayar (9), lift özeti olgun olanları (8); genç videonun 40x'i tutan sayısına girmez", () => {
    const group = buildInsights(input).durationBuckets.competitors.find((g) => g.key === "over_90");
    expect(group).toMatchObject({ n: 9, liftN: 8, outlierCount: 1 });
    expect(buildInsights(input).rows.find((r) => r.handle === "noelle")?.outlierCount).toBe(1);
  });

  it("plan: genç video tutan/kanıt olmaz; sabitlenmiş video yalnız baz çizgisinden çıkarılır (tutan sayılabilir)", () => {
    const draft = buildPlanDraft({ ...input, weekStart: NEXT_WEEK });
    const ids = draft.sections.winners.rivals.map((w) => w.contentItemId);
    expect(ids).not.toContain("young");
    expect(ids).toContain("pin");
    expect(draft.candidates.flatMap((c) => c.evidenceContentIds)).not.toContain("young");
  });
});
