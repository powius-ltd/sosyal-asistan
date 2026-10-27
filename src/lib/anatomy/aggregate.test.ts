import { describe, expect, it } from "vitest";

import { buildAnatomy } from "@/lib/anatomy/aggregate";
import { inputOf, NOW, OWN, RIVAL, type VideoSpec } from "@/lib/anatomy/test-fixtures";
import type { AnatomyReport, RecipeCohortKey } from "@/lib/domain/anatomy";

const cohort = (report: AnatomyReport, key: RecipeCohortKey) => report.recipe.cohorts.find((c) => c.key === key)!;
const spec = (id: string, over: Partial<VideoSpec> = {}): VideoSpec => ({ id, ...over });

/** 3 kendi (lift 0,9–1,2) + 4 tutan rakip + 3 diğer rakip. */
const FULL: VideoSpec[] = [
  spec("o1", { own: true, lift: 1.2, durationSec: 40, edit: { cutsPerMinute: 1.5, onScreenTextCount: 1, onCameraSpeaker: true } }),
  spec("o2", { own: true, lift: 0.9, durationSec: 50, edit: { cutsPerMinute: 1, onScreenTextCount: 2, onCameraSpeaker: true } }),
  spec("o3", { own: true, lift: 1.0, durationSec: 60, edit: { cutsPerMinute: 2, onScreenTextCount: 0, onCameraSpeaker: false } }),
  ...[3.2, 4, 5, 6].map((lift, i) => spec(`w${i}`, { lift, durationSec: 90 + i * 2, edit: { cutsPerMinute: 5 + i, onScreenTextCount: 4, onCameraSpeaker: false } })),
  ...[1.0, 1.1, 1.2].map((lift, i) => spec(`x${i}`, { lift, durationSec: 30 + i, edit: { cutsPerMinute: 2.5, onScreenTextCount: 3, onCameraSpeaker: true } })),
];

describe("buildAnatomy · kapsam", () => {
  it("yalnız kapsamdaki, ok + doğrulanmış analizli kısa videolar sayılır", () => {
    const report = buildAnatomy(
      inputOf(
        [
          ...FULL,
          spec("unverified", { lift: 4, verified: false }),
          spec("none", { lift: 4, noAnalysis: true }),
          spec("offniche", { lift: 4 }),
          spec("old", { lift: 4, daysAgo: 400 }),
          spec("long", { lift: 4, format: "long_video" }),
        ],
        { offNicheContentIds: ["offniche"] },
      ),
    );
    expect(report.counts).toEqual({ analyzed: 10, own: 3, rivals: 7, winners: 4 });
    expect(report.videos.map((v) => v.contentItemId)).not.toEqual(expect.arrayContaining(["unverified", "none", "offniche", "old", "long"]));
    expect(report.videos).toHaveLength(10);
  });

  it("izlenmeyen rakip girmez; accountId kendi tarafı daraltır; pencere days ile kırpılır", () => {
    const base = inputOf(FULL);
    const ignored = buildAnatomy({ ...base, competitors: [{ ...RIVAL, status: "ignored" }] });
    expect(ignored.counts).toMatchObject({ own: 3, rivals: 0 });
    const narrowed = buildAnatomy(base, { accountId: "başka" });
    expect(narrowed.counts.own).toBe(0);
    expect(narrowed.scope).toMatchObject({ accountId: "başka", ownHandles: [] });
    expect(buildAnatomy(base, { accountId: OWN.id }).scope.ownHandles).toEqual(["ornek"]);
    expect(buildAnatomy(base, { days: 5 }).counts.analyzed).toBe(0);
    expect(buildAnatomy(base, { days: 1 }).scope.days).toBe(7);
  });

  it("analiz yoksa boş rapor: her bölüm sebebiyle ölçülemedi", () => {
    const report = buildAnatomy(inputOf([spec("a", { noAnalysis: true })]));
    expect(report.counts.analyzed).toBe(0);
    expect(report.videos).toEqual([]);
    expect(report.unmeasured.map((u) => u.section)).toEqual(expect.arrayContaining(["videos", "hook_length", "body_mix", "recipe"]));
    expect(report.unmeasured.every((u) => u.reason.length > 0)).toBe(true);
  });

  it("saat = now; serileştirilebilir (JSON gidiş-dönüşü kayıpsız); video seçici lift'e göre azalan", () => {
    const report = buildAnatomy(inputOf([...FULL, spec("nolift", { lift: undefined })]));
    expect(report.generatedAt).toBe(NOW.toISOString());
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
    const lifts = report.videos.map((v) => v.currentLift);
    expect(lifts.at(-1)).toBeUndefined();
    const defined = lifts.filter((l): l is number => l !== undefined);
    expect(defined).toEqual([...defined].sort((a, b) => b - a));
  });
});

describe("buildAnatomy · boyut tabloları", () => {
  it("hook uzunluğu / ilk bölüme geçiş / CTA konumu / tempo: kendi ve rakip ayrı, n ve medyan lift", () => {
    const report = buildAnatomy(inputOf(FULL));
    // Hook metni 4 kelime → 1–6 kelime; ilk bölüme geçiş 16 sn → 10–20 sn; CTA 80. sn, süre 40–60 sn kendi videolarda: CTA süreden büyük (tutarsız) → ölçülemez.
    expect(report.hookLength.grouped.own.map((g) => [g.key, g.n])).toEqual([["1_6", 3]]);
    expect(report.hookLength.grouped.competitors.map((g) => [g.key, g.n])).toEqual([["1_6", 7]]);
    expect(report.firstSection.grouped.own[0]).toMatchObject({ key: "10_20", n: 3, liftN: 3 });
    expect(report.firstSection.grouped.own[0].medianLift).toBeCloseTo(1, 9);
    expect(report.firstSection.grouped.competitors[0].outlierCount).toBe(4);
    expect(report.ctaPosition.grouped.own).toEqual([]);
    expect(report.ctaPosition.grouped.competitors.map((g) => [g.key, g.n])).toEqual([["6_15s", 3], ["earlier", 1]]);
    expect(report.ctaPosition.unmeasuredReason).toContain("Kendi videolarında");
    expect(report.tempo.grouped.own.map((g) => [g.key, g.n])).toEqual([["under_2", 2], ["2_4", 1]]);
    expect(report.tempo.grouped.competitors.map((g) => [g.key, g.n])).toEqual([["2_4", 3], ["over_4", 4]]);
  });

  it("olgunlaşmamış (<3 gün) lift tabloya girmez (n sayar, liftN saymaz); güven örnek sayısından", () => {
    const report = buildAnatomy(inputOf([...FULL, spec("fresh", { lift: 9, immature: true })]));
    const group = report.hookLength.grouped.competitors[0];
    expect(group).toMatchObject({ n: 8, liftN: 7, confidence: "medium" });
    expect(report.counts.winners).toBe(4);
  });

  it("gövde türü karışımı: her tür için var/yok × lift; bölümü bilinmeyen video girmez", () => {
    const noBody = spec("nb", { own: true, lift: 2, sections: [{ type: "hook", quote: "a b", startSec: 0 }, { type: "insight", quote: "x y", startSec: 5 }] });
    const unknown = spec("unk", { lift: 2, sections: [] });
    const report = buildAnatomy(inputOf([...FULL, noBody, unknown]));
    const proof = report.bodyMix.find((r) => r.type === "proof")!;
    expect(proof.presence.own.map((g) => [g.key, g.n])).toEqual([["with", 3], ["without", 1]]);
    expect(proof.presence.competitors.map((g) => [g.key, g.n])).toEqual([["with", 7]]);
    expect(report.bodyMix.map((r) => r.type)).toEqual(["insight", "proof"]);
  });
});

describe("buildAnatomy · tutan reçetesi", () => {
  const report = buildAnatomy(inputOf(FULL));

  it("kohortlar ayrışır: tutan (≥3x), diğer rakip, kendi", () => {
    expect(report.recipe.cohorts.map((c) => [c.key, c.videoCount])).toEqual([["winners", 4], ["other_rivals", 3], ["own", 3]]);
    expect(cohort(report, "winners").metrics.durationSec).toMatchObject({ value: 93, n: 4 });
    expect(cohort(report, "other_rivals").metrics.durationSec).toMatchObject({ value: 31, n: 3 });
    expect(cohort(report, "own").metrics.durationSec).toMatchObject({ value: 50, n: 3 });
  });

  it("lift'i ölçülemeyen ya da olgunlaşmamış rakip, tutan da 'diğer rakip' de sayılmaz; kendi kohortta kalır", () => {
    const more = buildAnatomy(inputOf([...FULL, spec("u1", { lift: undefined }), spec("u2", { lift: 9, immature: true }), spec("ou", { own: true, lift: undefined })]));
    expect(more.recipe.cohorts.map((c) => c.videoCount)).toEqual([4, 3, 4]);
  });

  it("pay metrikleri (kamerada konuşmacı, CTA'lı video) ve CTA konum sayımı", () => {
    expect(cohort(report, "own").metrics.onCameraShare.value).toBeCloseTo(2 / 3, 9);
    expect(cohort(report, "winners").metrics.onCameraShare.value).toBe(0);
    expect(cohort(report, "winners").metrics.ctaShare).toMatchObject({ value: 1, n: 4 });
    // CTA 80. sn: süre 90/92/94 → 6–15 sn kala; 96 → 16 sn kala (daha önce).
    expect(cohort(report, "winners").ctaPositionCounts).toEqual({ "6_15s": 3, earlier: 1 });
    expect(cohort(report, "winners").bodyShares).toMatchObject({ proof: { value: 1, n: 4 }, insight: { value: 1, n: 4 } });
  });

  it("fark metni kodla: iki taraf ölçülmüşse sayılar yazılır, güven iki kohortun zayıfı", () => {
    const duration = report.recipe.differences.find((d) => d.metric === "durationSec")!;
    expect(duration).toMatchObject({ ownValue: 50, winnersValue: 93, text: "@ornek 50 sn, tutan videolar 93 sn" });
    expect(duration.reason).toBeUndefined();
    // winners n=4 (düşük), own n=3 (düşük).
    expect(duration.confidence).toBe("low");
    expect(report.recipe.differences.find((d) => d.metric === "cutsPerMinute")?.text).toBe("@ornek 1,5 kesme/dk, tutan videolar 6,5 kesme/dk");
    expect(report.recipe.differences.find((d) => d.metric === "onCameraShare")?.text).toBe("@ornek %67, tutan videolar %0");
  });

  it("n < 3 → değer undefined + sebep (0 değil); fark metni yok; reçete ölçülemedi notu", () => {
    const small = buildAnatomy(inputOf([spec("o1", { own: true, lift: 1 }), spec("o2", { own: true, lift: 1 }), spec("w1", { lift: 4 }), spec("w2", { lift: 5 })]));
    const winners = cohort(small, "winners");
    expect(winners.videoCount).toBe(2);
    expect(winners.metrics.durationSec.n).toBe(2);
    expect(winners.metrics.durationSec.value).toBeUndefined();
    expect(winners.metrics.durationSec.reason).toContain("yalnız 2 videoda");
    expect(winners.bodyShares.proof.n).toBe(2);
    expect(winners.bodyShares.proof.value).toBeUndefined();
    expect(small.recipe.differences.every((d) => d.text === undefined && d.reason)).toBe(true);
    expect(small.unmeasured.find((u) => u.section === "recipe")?.reason).toContain("en az 3");
    // Hiç video olmayan kohort: sebep "grupta video yok".
    const empty = cohort(small, "other_rivals").metrics.hookWords;
    expect(empty.value).toBeUndefined();
    expect(empty).toMatchObject({ n: 0, reason: "Bu grupta incelenmiş video yok." });
  });

  it("bir tarafta ölçülemeyen metrik (kurgu ölçümü yok) o metrik için fark metni vermez", () => {
    const noEdit = buildAnatomy(inputOf(FULL.map((v) => ({ ...v, edit: undefined }))));
    const cuts = noEdit.recipe.differences.find((d) => d.metric === "cutsPerMinute")!;
    expect(cuts.text).toBeUndefined();
    expect(cuts.reason).toContain("kesme/dk");
    expect(noEdit.recipe.differences.find((d) => d.metric === "durationSec")?.text).toBeDefined();
  });

  it("baz çizgisi düşük güvenli örnekler güveni orta ile sınırlar (tek kural: summarizeLiftSamples)", () => {
    const many = Array.from({ length: 10 }, (_, i) => spec(`w${i}`, { lift: 3.5 + i, lowConfidence: true }));
    const capped = buildAnatomy(inputOf([...many, spec("o1", { own: true, lift: 1 })]));
    expect(cohort(capped, "winners")).toMatchObject({ confidence: "medium", lowBaselineShare: 1 });
    const solid = buildAnatomy(inputOf(Array.from({ length: 10 }, (_, i) => spec(`w${i}`, { lift: 3.5 + i }))));
    expect(cohort(solid, "winners").confidence).toBe("high");
  });
});
