/**
 * `buildInsights` genişletmeleri: niş dışı rozeti ve grup dışı bırakma, olgunlaşmamış içeriğin lift özetine girmemesi,
 * hedef kitle saat dilimi (gün sınırı, `timezone` yedeği), saat profili (`postingHours`), rakip tarafı ölçülemeyen bölümler.
 */
import { describe, expect, it } from "vitest";

import { buildInsights, type InsightsInput } from "@/lib/data/views/insights";
import { postingHours } from "@/lib/data/views/insights-posting";
import { qualityBadges } from "@/lib/data/views/insights-quality";
import { groupStat, usableLift } from "@/lib/data/views/insights-groups";
import { CTA_CAPTION, video } from "@/lib/insights/testing/builders";
import { FIXTURE_COMPETITORS, FIXTURE_NOW, FIXTURE_OWN, FIXTURE_WORKSPACE } from "@/lib/insights/testing/faz2-fixture";

const input = (items: ReturnType<typeof video>[], over: Partial<InsightsInput> = {}): InsightsInput => ({
  workspace: FIXTURE_WORKSPACE, own: FIXTURE_OWN, competitors: FIXTURE_COMPETITORS, items, now: FIXTURE_NOW, ...over,
});
const row = (result: ReturnType<typeof buildInsights>, handle: string) => result.rows.find((r) => r.handle === handle);

describe("niş dışı içerik", () => {
  const items = [
    video({ id: "a", owner: "evelyn", dur: 100, lift: 1.4 }),
    video({ id: "b", owner: "evelyn", dur: 100, lift: 6 }),
    video({ id: "c", owner: "evelyn", dur: 20, lift: 0.5 }),
  ];

  it("elek verildiyse hesap satırında rozet çıkar; verilmediyse rozet yok (elek çalışmamış ≠ niş dışı yok)", () => {
    const flagged = row(buildInsights(input(items, { offNicheContentIds: ["b"] })), "evelyn");
    expect(flagged?.quality.find((q) => q.kind === "off_niche")).toEqual({ kind: "off_niche", count: 1, total: 3 });
    expect(row(buildInsights(input(items)), "evelyn")?.quality.some((q) => q.kind === "off_niche")).toBe(false);
    // Elek çalıştı ama hiçbir şey elenmedi: 0 sayımlı rozet üretilmez.
    expect(row(buildInsights(input(items, { offNicheContentIds: [] })), "evelyn")?.quality.some((q) => q.kind === "off_niche")).toBe(false);
  });

  it("niş dışı video süre/CTA grup tablolarına girmez ama hesap satırında sayılır", () => {
    const result = buildInsights(input(items, { offNicheContentIds: ["b"] }));
    const over90 = result.durationBuckets.competitors.find((g) => g.key === "over_90");
    expect(over90).toMatchObject({ n: 1, outlierCount: 0 });
    expect(over90?.medianLift).toBeCloseTo(1.4, 9);
    expect(row(result, "evelyn")?.videoCount).toBe(3);
  });

  it("qualityBadges doğrudan: sıra sabit (gizli beğeni, genç, lift yok, az örnek, niş dışı)", () => {
    const videos = [{ ...video({ id: "x", owner: "evelyn", lift: undefined, immature: true }), metrics: { views: 5, viewsKind: "ig_play_count" as const, extra: {} } }];
    expect(qualityBadges(videos, new Set(["x"])).map((b) => b.kind)).toEqual(["hidden_likes", "too_young", "no_baseline", "low_sample", "off_niche"]);
    expect(qualityBadges([], new Set(["x"]))).toEqual([]);
  });
});

describe("olgunlaşmamış (<3 gün) içerik lift özetine girmez", () => {
  it("usableLift: olgun → lift, genç → undefined, ölçülemeyen → undefined", () => {
    expect([video({ id: "a", owner: "noelle", lift: 2 }), video({ id: "b", owner: "noelle", lift: 2, immature: true }), video({ id: "c", owner: "noelle" })].map(usableLift)).toEqual([2, undefined, undefined]);
  });

  it("grup: n tüm videoları sayar, liftN/medyan/tutan yalnız olgunları", () => {
    const stat = groupStat("over_90", [video({ id: "a", owner: "noelle", lift: 4 }), video({ id: "b", owner: "noelle", lift: 0.1, immature: true }), video({ id: "c", owner: "noelle", lift: 2 })]);
    expect(stat).toMatchObject({ n: 3, liftN: 2, outlierCount: 1, confidence: "low" });
    expect(stat.medianLift).toBeCloseTo(3, 9);
  });

  it("hesap satırı: tüm videolar genç ise medyan lift ve tutan sayısı undefined (0 değil)", () => {
    const young = [video({ id: "a", owner: "evelyn", lift: 9, immature: true, daysAgo: 1 }), video({ id: "b", owner: "evelyn", lift: 0.1, immature: true, daysAgo: 2 })];
    expect(row(buildInsights(input(young)), "evelyn")).toMatchObject({ medianLift: undefined, outlierCount: undefined, videoCount: 2 });
  });
});

describe("hedef kitle saat dilimi", () => {
  // 2026-09-28T03:30Z: UTC'de Pazartesi 03:30 → New York'ta PAZAR 23:30 (gün sınırı), İstanbul'da Pazartesi 06:30.
  const boundary = [0, 7, 14].map((d) => video({ id: `b${d}`, owner: "noelle", views: 100 + d, publishedAt: new Date(Date.parse("2026-09-28T03:30:00.000Z") - d * 86_400_000).toISOString() }));

  it("ET gün sınırı: Pazar 23:00 dilimi (weekday 6, saat 23); İstanbul'da Pazartesi 06:00 (weekday 0, saat 6)", () => {
    expect(row(buildInsights(input(boundary)), "noelle")?.posting.commonSlots[0]).toMatchObject({ weekday: 6, hour: 23, n: 3 });
    expect(row(buildInsights(input(boundary, { workspace: { audienceTimeZone: "Europe/Istanbul" } })), "noelle")?.posting.commonSlots[0]).toMatchObject({ weekday: 0, hour: 6, n: 3 });
  });

  it("audienceTimeZone yoksa timezone kullanılır; ikisi de yoksa varsayılan; kapsama yazılır", () => {
    expect(buildInsights(input(boundary, { workspace: { timezone: "America/New_York" } })).scope.audienceTimeZone).toBe("America/New_York");
    expect(buildInsights(input(boundary, { workspace: {} })).scope.audienceTimeZone).toBe("Europe/Istanbul");
    expect(row(buildInsights(input(boundary, { workspace: { timezone: "America/New_York" } })), "noelle")?.posting.commonSlots[0]).toMatchObject({ weekday: 6, hour: 23 });
  });

  it("postingHours: yalnız saat (gün yok), n azalan; her gün 07:30 ET paylaşan hesap 07'de %100", () => {
    const daily = Array.from({ length: 6 }, (_, i) => video({ id: `d${i}`, owner: "noelle", views: 1_000 * (i + 1), lift: 1 + i / 10, publishedAt: new Date(Date.parse("2026-09-20T11:30:00.000Z") + i * 86_400_000).toISOString() }));
    const hours = postingHours(daily, "America/New_York");
    expect(hours).toHaveLength(1);
    expect(hours[0]).toMatchObject({ hour: 7, n: 6, share: 1, liftN: 6, medianViews: 3_500 });
    expect(hours[0].medianLift).toBeCloseTo(1.25, 9);
    expect(postingHours(daily, "Europe/Istanbul")[0].hour).toBe(14);
  });

  it("postingHours: tarihli video yoksa [], lift'siz saat medyanı undefined; sıralama n azalan sonra saat artan", () => {
    expect(postingHours([], "America/New_York")).toEqual([]);
    const undated = { ...video({ id: "u", owner: "noelle" }), publishedAt: undefined };
    expect(postingHours([undated], "America/New_York")).toEqual([]);
    const mixed = [
      video({ id: "a", owner: "noelle", publishedAt: "2026-09-20T12:00:00.000Z" }),
      video({ id: "b", owner: "noelle", publishedAt: "2026-09-21T15:00:00.000Z", lift: 1 }),
      video({ id: "c", owner: "noelle", publishedAt: "2026-09-22T15:00:00.000Z", lift: 2 }),
      video({ id: "d", owner: "noelle", publishedAt: "2026-09-23T11:00:00.000Z" }),
    ];
    const hours = postingHours(mixed, "America/New_York");
    expect(hours.map((h) => [h.hour, h.n])).toEqual([[11, 2], [7, 1], [8, 1]]);
    expect(hours[0]).toMatchObject({ liftN: 2, medianLift: 1.5 });
    expect(hours[1]).toMatchObject({ liftN: 0, medianLift: undefined });
  });
});

describe("rakip tarafı ölçülemeyen bölümler", () => {
  it("izlenen rakiplerde hiç kısa video yoksa süre/CTA/hook bölümleri sebeple işaretlenir (kendi tarafı doluysa)", () => {
    const result = buildInsights(input([video({ id: "m", owner: "ornek", dur: 12, caption: CTA_CAPTION, lift: 1 })]));
    const reasons = result.unmeasured.filter((u) => u.reason.includes("rakiplerde son"));
    expect(reasons.map((u) => u.section).sort()).toEqual(["cta_types", "duration_buckets", "hook_types"]);
    expect(result.durationBuckets.competitors).toEqual([]);
  });

  it("rakip videosu varsa rakip sebebi yok", () => {
    const result = buildInsights(input([video({ id: "m", owner: "ornek", dur: 12, lift: 1 }), video({ id: "r", owner: "noelle", dur: 50, lift: 1 })]));
    expect(result.unmeasured.some((u) => u.reason.includes("rakiplerde son"))).toBe(false);
  });
});
