/**
 * `Insights.hookTypes` (yalnız `ok` + doğrulanmış analizden hook türü × lift), grup güveninin baz çizgisi tavanı ve
 * `PostingPattern.commonHours` (en sık 3 saat) — `buildInsights` üzerinden.
 */
import { describe, expect, it } from "vitest";

import { buildInsights, type InsightsInput } from "@/lib/data/views/insights";
import { verifiedHookTypeById } from "@/lib/data/views/insights-hooks";
import { video } from "@/lib/insights/testing/builders";
import { FIXTURE_COMPETITORS, FIXTURE_NOW, FIXTURE_OWN, FIXTURE_WORKSPACE, fixtureItems } from "@/lib/insights/testing/faz2-fixture";
import type { AnalysisRef } from "@/lib/insights/types";

const input = (items: ReturnType<typeof video>[], over: Partial<InsightsInput> = {}): InsightsInput => ({
  workspace: FIXTURE_WORKSPACE, own: FIXTURE_OWN, competitors: FIXTURE_COMPETITORS, items, now: FIXTURE_NOW, ...over,
});
const analysis = (contentItemId: string, hookType: string | undefined, over: Partial<AnalysisRef> = {}): AnalysisRef => ({ contentItemId, status: "ok", evidenceVerified: true, hookType, ...over });
const row = (result: ReturnType<typeof buildInsights>, handle: string) => result.rows.find((r) => r.handle === handle);
const hookReasons = (result: ReturnType<typeof buildInsights>) => result.unmeasured.filter((u) => u.section === "hook_types");

describe("verifiedHookTypeById", () => {
  it("yalnız status=ok VE evidenceVerified VE hook türü dolu analiz haritaya girer", () => {
    const map = verifiedHookTypeById([
      analysis("a", "question"),
      analysis("b", "list", { evidenceVerified: false }),
      analysis("c", "pov", { status: "failed" }),
      analysis("d", "pov", { status: "insufficient_data" }),
      analysis("e", undefined),
      analysis("f", ""),
    ]);
    expect([...map]).toEqual([["a", "question"]]);
    expect(verifiedHookTypeById(undefined).size).toBe(0);
  });
});

describe("hookTypes", () => {
  const items = [
    video({ id: "o1", owner: "ornek", dur: 20, lift: 1.2 }),
    video({ id: "n1", owner: "noelle", dur: 90, lift: 4 }),
    video({ id: "n2", owner: "noelle", dur: 90, lift: 2 }),
    video({ id: "n3", owner: "noelle", dur: 90, lift: 9 }), // kanıtı doğrulanmamış
    video({ id: "n4", owner: "noelle", dur: 90, lift: 9 }), // analiz başarısız
    video({ id: "n5", owner: "noelle", dur: 90, lift: 9 }), // yetersiz veri
    video({ id: "n6", owner: "noelle", dur: 90, lift: 9 }), // analizi yok
    video({ id: "n7", owner: "noelle", dur: 90, lift: 9 }), // hook türü yok
    video({ id: "n8", owner: "align", dur: 90, lift: 1.5 }), // taksonomide olmayan (başka sürüm) tür
    video({ id: "e1", owner: "evelyn", dur: 90, lift: 6 }), // niş dışı
  ];
  const analyses = [
    analysis("o1", "question"),
    analysis("n1", "question"),
    analysis("n2", "question"),
    analysis("n3", "bold_claim", { evidenceVerified: false }),
    analysis("n4", "list", { status: "failed" }),
    analysis("n5", "pov", { status: "insufficient_data" }),
    analysis("n7", undefined),
    analysis("n8", "future_type"),
    analysis("e1", "question"),
  ];
  const result = buildInsights(input(items, { analyses, offNicheContentIds: ["e1"] }));

  it("kendi ve rakip ayrı; yalnız ok + doğrulanmış analizlerden, niş dışı içerik girmez", () => {
    expect(result.hookTypes.own.map((g) => [g.key, g.n])).toEqual([["question", 1]]);
    // "question" 2 videoyla (n1, n2): e1 niş dışı olduğundan 6x lift'i gruba girmez; n3..n7 analiz kuralını geçmez.
    expect(result.hookTypes.competitors.map((g) => [g.key, g.n])).toEqual([["question", 2], ["future_type", 1]]);
    const question = result.hookTypes.competitors[0];
    expect(question).toMatchObject({ liftN: 2, outlierCount: 1, confidence: "low" });
    expect(question.medianLift).toBeCloseTo(3, 9);
  });

  it("sıra: taksonomideki türler taksonomi sırasıyla, bilinmeyen (başka sürüm) türler sonda; hiçbiri sessizce düşmez", () => {
    const twoTypes = buildInsights(input(
      [video({ id: "a", owner: "noelle", lift: 1 }), video({ id: "b", owner: "noelle", lift: 1 }), video({ id: "c", owner: "noelle", lift: 1 })],
      { analyses: [analysis("a", "zzz_new"), analysis("b", "bold_claim"), analysis("c", "question")] },
    ));
    expect(twoTypes.hookTypes.competitors.map((g) => g.key)).toEqual(["question", "bold_claim", "zzz_new"]);
  });

  it("niş dışı elek verilmediyse (offNicheContentIds yok) hiçbir video süzülmez", () => {
    const unfiltered = buildInsights(input(items, { analyses }));
    expect(unfiltered.hookTypes.competitors.find((g) => g.key === "question")?.n).toBe(3);
  });

  it("lift'i ölçülemeyen video gruba n olarak girer ama liftN'e girmez; medyan undefined (0 değil)", () => {
    const r = buildInsights(input([video({ id: "x", owner: "noelle", lift: undefined })], { analyses: [analysis("x", "list")] }));
    expect(r.hookTypes.competitors[0]).toMatchObject({ key: "list", n: 1, liftN: 0, confidence: "low" });
    expect(r.hookTypes.competitors[0].medianLift).toBeUndefined();
  });
});

describe("hookTypes · ölçülemeyen sebepleri", () => {
  const own = video({ id: "o", owner: "ornek", dur: 20, lift: 1 });
  const rival = video({ id: "r", owner: "noelle", dur: 60, lift: 2 });

  it("analiz verisi verilmediyse iki taraf boş ve sebep yazılır", () => {
    const r = buildInsights(input([own, rival]));
    expect(r.hookTypes).toEqual({ own: [], competitors: [] });
    expect(hookReasons(r)).toHaveLength(1);
    expect(hookReasons(r)[0].reason).toContain("verilmedi");
  });

  it("analiz var ama hiçbiri ok + doğrulanmış değil → boş ve 'analiz edilmiş video yok'", () => {
    const r = buildInsights(input([own, rival], { analyses: [analysis("r", "question", { evidenceVerified: false })] }));
    expect(r.hookTypes).toEqual({ own: [], competitors: [] });
    expect(hookReasons(r)[0].reason).toContain("Analiz edilmiş");
  });

  it("yalnız rakip analiz edildiyse kendi taraf sebebi yazılır; yalnız kendi analiz edildiyse rakip sebebi", () => {
    const onlyRival = buildInsights(input([own, rival], { analyses: [analysis("r", "question")] }));
    expect(onlyRival.hookTypes.competitors).toHaveLength(1);
    expect(hookReasons(onlyRival)[0].reason).toContain("Kendi videoların");
    const onlyOwn = buildInsights(input([own, rival], { analyses: [analysis("o", "question")] }));
    expect(hookReasons(onlyOwn)[0].reason).toContain("rakiplerin");
  });

  it("iki taraf da doluysa sebep yok", () => {
    expect(hookReasons(buildInsights(input([own, rival], { analyses: [analysis("o", "question"), analysis("r", "question")] })))).toEqual([]);
  });

  it("kendi hesapta video yoksa video-yok sebebi yazılır; hook türü için ikinci bir sebep EKLENMEZ", () => {
    const r = buildInsights(input([rival], { analyses: [analysis("r", "question")] }));
    expect(hookReasons(r)).toHaveLength(1);
    expect(hookReasons(r)[0].reason).toContain("Kendi hesabında son");
  });
});

describe("grup güveni · baz çizgisi tavanı (buildInsights grupları)", () => {
  // Açıklama dolu olmalı: açıklamasız video CTA türü bilinmediği için CTA grubuna girmez (`classifyCta` → undefined).
  const rivals = (lowBaseline: boolean) => Array.from({ length: 10 }, (_, i) => video({ id: `r${i}`, owner: "noelle", dur: 95, lift: 1 + i / 10, lowBaseline, caption: "A quiet practice." }));
  const analyses = Array.from({ length: 10 }, (_, i) => analysis(`r${i}`, "question"));

  it("10 ölçülmüş video + düşük güvenli baz çizgisi → orta (süre, CTA ve hook grupları aynı kuralı paylaşır); sağlam baz çizgisinde yüksek", () => {
    const low = buildInsights(input(rivals(true), { analyses }));
    for (const group of [low.durationBuckets.competitors[0], low.ctaTypes.competitors[0], low.hookTypes.competitors[0]]) {
      expect(group).toMatchObject({ liftN: 10, confidence: "medium", lowBaselineShare: 1 });
    }
    const solid = buildInsights(input(rivals(false), { analyses }));
    for (const group of [solid.durationBuckets.competitors[0], solid.ctaTypes.competitors[0], solid.hookTypes.competitors[0]]) {
      expect(group).toMatchObject({ liftN: 10, confidence: "high", lowBaselineShare: 0 });
    }
  });

  it("pay ölçülmüş videolardan: yarısı düşük güvenli → orta; %40 → yüksek", () => {
    const half = Array.from({ length: 10 }, (_, i) => video({ id: `h${i}`, owner: "noelle", dur: 95, lift: 1.2, lowBaseline: i < 5 }));
    expect(buildInsights(input(half)).durationBuckets.competitors[0]).toMatchObject({ confidence: "medium", lowBaselineShare: 0.5 });
    const fewer = Array.from({ length: 10 }, (_, i) => video({ id: `f${i}`, owner: "noelle", dur: 95, lift: 1.2, lowBaseline: i < 4 }));
    expect(buildInsights(input(fewer)).durationBuckets.competitors[0]).toMatchObject({ confidence: "high", lowBaselineShare: 0.4 });
  });
});

describe("PostingPattern.commonHours", () => {
  const result = buildInsights(input(fixtureItems), { days: 90 });

  it("noelle: 10 videonun 10'u 07 ET → tek saat, payı 1", () => {
    const { commonHours } = (row(result, "noelle") as NonNullable<ReturnType<typeof row>>).posting;
    expect(commonHours).toHaveLength(1);
    expect(commonHours[0]).toMatchObject({ hour: 7, n: 10, share: 1 });
    expect(commonHours[0].liftN).toBeGreaterThan(0);
    expect(commonHours[0].medianLift).toBeGreaterThan(0);
  });

  it("Ornek: en çok 3 saat, n azalan sonra saat artan (20 iki kez; 07 ve 09 birer)", () => {
    const { commonHours } = (row(result, "ornekhesap") as NonNullable<ReturnType<typeof row>>).posting;
    expect(commonHours.map((h) => [h.hour, h.n])).toEqual([[20, 2], [7, 1], [9, 1]]);
    expect(commonHours.every((h) => h.share > 0 && h.share <= 1)).toBe(true);
  });

  it("videosu olmayan hesap: boş liste; tarihli 1 video → postsPerWeek undefined, 2 video → değer (≥ 2 kuralı)", () => {
    const one = buildInsights(input([video({ id: "a", owner: "noelle", daysAgo: 3, lift: 1 })]));
    expect(row(one, "align")?.posting.commonHours).toEqual([]);
    expect(row(one, "noelle")?.posting.postsPerWeek).toBeUndefined();
    const two = buildInsights(input([video({ id: "a", owner: "noelle", daysAgo: 3, lift: 1 }), video({ id: "b", owner: "noelle", daysAgo: 10, lift: 1 })]));
    expect(row(two, "noelle")?.posting.postsPerWeek).toBeCloseTo(2, 5);
  });
});
