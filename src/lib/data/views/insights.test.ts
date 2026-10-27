import { describe, expect, it } from "vitest";

import type { Competitor, OwnAccount } from "@/lib/domain/competitor";
import type { ContentItem } from "@/lib/domain/content";
import { buildInsights, insightsDays, type InsightsInput } from "@/lib/data/views/insights";

const NOW = new Date("2026-09-30T12:00:00.000Z");
const DAY = 86_400_000;

const own = (over: Partial<OwnAccount> = {}): OwnAccount => ({
  id: "own1", workspaceId: "w", platform: "instagram", handle: "ornek", followers: 1_400, connection: "scrape_only", scopes: [], createdAt: "2026-01-01T00:00:00.000Z", ...over,
});
const rival = (id: string, over: Partial<Competitor> = {}): Competitor => ({
  id, workspaceId: "w", platform: "instagram", handle: id, status: "tracked", source: "manual", missingFields: [], contentCount: 0, addedAt: "2026-01-01T00:00:00.000Z", followers: 20_000, ...over,
});

let seq = 0;
interface ItemSpec {
  owner: { kind: "own" | "competitor"; id: string };
  daysAgo: number;
  durationSec?: number;
  caption?: string;
  views?: number;
  lift?: number;
  likes?: number;
  hashtags?: string[];
  format?: ContentItem["format"];
  immature?: boolean;
  publishedAt?: string;
}
function item(spec: ItemSpec): ContentItem {
  seq += 1;
  const tier = spec.lift === undefined ? undefined : spec.lift >= 5 ? 4 : spec.lift >= 3 ? 3 : spec.lift >= 2 ? 2 : spec.lift >= 1.5 ? 1 : 0;
  return {
    id: `c${seq}`, workspaceId: "w", platform: "instagram", externalId: `e${seq}`,
    owner: { kind: spec.owner.kind, id: spec.owner.id, handle: spec.owner.id },
    format: spec.format ?? "short_video",
    publishedAt: spec.publishedAt ?? new Date(NOW.getTime() - spec.daysAgo * DAY).toISOString(),
    caption: spec.caption, hashtags: spec.hashtags ?? [], durationSec: spec.durationSec, missingFields: [],
    metrics: { views: spec.views, viewsKind: spec.views === undefined ? undefined : "ig_play_count", likes: spec.likes, extra: {} },
    score: { lift: spec.lift, liftTier: tier, lowConfidence: false, immature: spec.immature ?? false },
    hasTranscript: false, firstSeenAt: "2026-09-01T00:00:00.000Z",
  };
}

const input = (items: ContentItem[], over: Partial<InsightsInput> = {}): InsightsInput => ({
  workspace: { audienceTimeZone: "America/New_York" }, own: [own()], competitors: [rival("noelle"), rival("align", { followers: 1_000 })], items, now: NOW, ...over,
});
const O = { kind: "own" as const, id: "own1" };
const R1 = { kind: "competitor" as const, id: "noelle" };
const R2 = { kind: "competitor" as const, id: "align" };

describe("buildInsights · süre kovası × lift (kendi ve rakip AYRI)", () => {
  const items = [
    item({ owner: O, daysAgo: 5, durationSec: 12, views: 900, lift: 0.9, likes: 10 }),
    item({ owner: O, daysAgo: 9, durationSec: 14, views: 1_100, lift: 1.1, likes: 12 }),
    item({ owner: O, daysAgo: 12, durationSec: 20, views: 1_000, lift: 1, likes: 11 }),
    item({ owner: R1, daysAgo: 4, durationSec: 56, views: 90_000, lift: 4.5, likes: 900 }),
    item({ owner: R1, daysAgo: 6, durationSec: 92, views: 60_000, lift: 3.2, likes: 600 }),
    item({ owner: R2, daysAgo: 7, durationSec: 128, views: 70_000, lift: 5.5, likes: 700 }),
    item({ owner: R2, daysAgo: 8, durationSec: 108, views: 10_000, lift: 1.2, likes: 100 }),
    item({ owner: R2, daysAgo: 10, durationSec: 25, views: 500, lift: 0.4, likes: 5 }),
  ];
  const result = buildInsights(input(items));

  it("kendi videolar 15 sn altı ve 15–30 sn kovasında; rakipler uzun kovalarda", () => {
    expect(result.durationBuckets.own.map((g) => [g.key, g.n])).toEqual([["under_15", 2], ["15_30", 1]]);
    // 92, 108 ve 128 sn → "90 sn ve üstü" (alt sınır dahil); 56 sn → 30–60; 25 sn → 15–30.
    expect(result.durationBuckets.competitors.map((g) => [g.key, g.n])).toEqual([["15_30", 1], ["30_60", 1], ["over_90", 3]]);
  });

  it("medyan lift ve tutan sayısı kova içinden; az örnek düşük güven", () => {
    const over90 = result.durationBuckets.competitors.find((g) => g.key === "over_90");
    expect(over90).toMatchObject({ n: 3, liftN: 3, outlierCount: 2, confidence: "low" });
    expect(over90?.medianLift).toBeCloseTo(3.2, 9);
    const under15 = result.durationBuckets.own.find((g) => g.key === "under_15");
    expect(under15?.medianLift).toBeCloseTo(1, 9);
    expect(under15?.outlierCount).toBe(0);
  });
});

describe("buildInsights · CTA türü × lift", () => {
  it("açıklamadan sınıflanır; açıklaması olmayan video CTA grubuna girmez (none değil)", () => {
    const items = [
      item({ owner: R1, daysAgo: 3, caption: "Comment RENEW below", views: 50_000, lift: 4 }),
      item({ owner: R1, daysAgo: 4, caption: "Comment FUTURE SELF", views: 40_000, lift: 3.4 }),
      item({ owner: R1, daysAgo: 5, caption: "A quiet morning", views: 5_000, lift: 0.5 }),
      item({ owner: R1, daysAgo: 6, views: 6_000, lift: 0.6 }),
      item({ owner: O, daysAgo: 6, caption: "Link in bio", views: 900, lift: 0.9 }),
    ];
    const { ctaTypes, rows } = buildInsights(input(items));
    expect(ctaTypes.competitors.map((g) => [g.key, g.n])).toEqual([["comment_keyword", 2], ["none", 1]]);
    expect(ctaTypes.competitors[0]).toMatchObject({ outlierCount: 2 });
    expect(ctaTypes.own.map((g) => g.key)).toEqual(["link_in_bio"]);
    // Yorum-anahtar-kelime payı: açıklaması olan 3 videonun 2'si.
    expect(rows.find((r) => r.subjectId === "noelle")?.commentCtaShare).toBeCloseTo(2 / 3, 9);
  });
});

describe("buildInsights · karşılaştırma satırı", () => {
  it("medyan izlenme ÷ takipçi, medyan süre, lift, tutan sayısı; kendi satırı önce", () => {
    const items = [
      item({ owner: O, daysAgo: 2, durationSec: 10, views: 900, lift: 2 }),
      item({ owner: O, daysAgo: 4, durationSec: 14, views: 1_100, lift: 1 }),
      item({ owner: R1, daysAgo: 2, durationSec: 60, views: 1_600, lift: 0.8 }),
    ];
    const { rows } = buildInsights(input(items));
    expect(rows.map((r) => r.handle)).toEqual(["ornek", "noelle", "align"]);
    const mine = rows[0];
    expect(mine.subjectKind).toBe("own");
    expect(mine.medianViews).toBe(1_000);
    expect(mine.medianViewsPerFollower).toBeCloseTo(1_000 / 1_400, 9);
    expect(mine.medianDurationSec).toBe(12);
    expect(mine.medianLift).toBeCloseTo(1.5, 9);
    expect(mine.outlierCount).toBe(0);
    expect(mine.videoCount).toBe(2);
  });

  it("video yoksa ölçülemez: medyanlar ve tutan sayısı undefined (0 değil), paylaşım dilimi yok", () => {
    const { rows } = buildInsights(input([]));
    const empty = rows.find((r) => r.handle === "noelle");
    expect(empty).toMatchObject({ videoCount: 0, medianViews: undefined, medianViewsPerFollower: undefined, medianLift: undefined, outlierCount: undefined, commentCtaShare: undefined });
    expect(empty?.posting.commonSlots).toEqual([]);
    expect(empty?.posting.daysSinceLastPost).toBeUndefined();
    expect(empty?.quality).toEqual([]);
  });

  it("lift hiç ölçülemediyse tutan sayısı undefined; ölçülmüşse 0 gerçek sıfırdır", () => {
    const noLift = buildInsights(input([item({ owner: R1, daysAgo: 2, views: 100 })])).rows.find((r) => r.handle === "noelle");
    expect(noLift?.outlierCount).toBeUndefined();
    const zero = buildInsights(input([item({ owner: R1, daysAgo: 2, views: 100, lift: 0.5 })])).rows.find((r) => r.handle === "noelle");
    expect(zero?.outlierCount).toBe(0);
  });
});

describe("buildInsights · paylaşım saati (hedef kitle dilimi), hashtag imzası, veri kalitesi", () => {
  it("saat/gün hedef kitle saat diliminde: 2026-09-28 12:00Z (Pzt) New York'ta Pzt 08:00", () => {
    const items = [0, 7, 14].map((d) => item({ owner: R1, daysAgo: 0, publishedAt: new Date(Date.parse("2026-09-28T12:00:00.000Z") - d * DAY).toISOString(), views: 1_000 + d }));
    const noelle = buildInsights(input(items)).rows.find((r) => r.handle === "noelle");
    expect(noelle?.posting.commonSlots[0]).toMatchObject({ weekday: 0, hour: 8, n: 3 });
    expect(noelle?.posting.topSlotShare).toBe(1);
    expect(noelle?.posting.daysSinceLastPost).toBe(2);
    const istanbul = buildInsights(input(items, { workspace: { audienceTimeZone: "Europe/Istanbul" } })).rows.find((r) => r.handle === "noelle");
    expect(istanbul?.posting.commonSlots[0]).toMatchObject({ weekday: 0, hour: 15 });
  });

  it("imza etiket: 9/10 videoda aynı etiket; tekil etiket payı ayrı hesaplanır", () => {
    const tagged = Array.from({ length: 9 }, (_, i) => item({ owner: R1, daysAgo: i + 1, hashtags: ["renewyourmind", `x${i}`], views: 100 }));
    const plain = item({ owner: R1, daysAgo: 12, hashtags: ["other"], views: 100 });
    const sig = buildInsights(input([...tagged, plain])).rows.find((r) => r.handle === "noelle")?.hashtags;
    expect(sig).toMatchObject({ topTag: "renewyourmind", topTagVideos: 9, medianTagCount: 2 });
    expect(sig?.topTagShare).toBeCloseTo(9 / 10, 9);
    // 11 farklı etiket (renewyourmind 9 video, diğer 10'u 1'er video): tekil = 10/11.
    expect(sig?.singleUseShare).toBeCloseTo(10 / 11, 9);
  });

  it("kalite rozetleri: gizli beğeni, 3 günden genç, lift yok, az örnek", () => {
    const items = [
      item({ owner: R2, daysAgo: 1, views: 100, immature: true }),
      item({ owner: R2, daysAgo: 5, views: 200, lift: 1, likes: 3 }),
      item({ owner: R2, daysAgo: 6, views: 200, lift: 1 }),
    ];
    const quality = buildInsights(input(items)).rows.find((r) => r.handle === "align")?.quality ?? [];
    expect(Object.fromEntries(quality.map((b) => [b.kind, [b.count, b.total]]))).toEqual({
      hidden_likes: [2, 3],
      too_young: [1, 3],
      no_baseline: [1, 3],
      low_sample: [3, 10],
    });
  });
});

describe("buildInsights · kapsam ve ölçülemeyen bölümler", () => {
  it("pencere dışı, kısa video olmayan ve izlenmeyen (tracked dışı) rakip içeriği sayılmaz", () => {
    const items = [
      item({ owner: R1, daysAgo: 10, views: 100 }),
      item({ owner: R1, daysAgo: 120, views: 100 }),
      item({ owner: R1, daysAgo: 10, views: 100, format: "carousel" }),
      item({ owner: { kind: "competitor", id: "ignored" }, daysAgo: 10, views: 100 }),
    ];
    const result = buildInsights(input(items, { competitors: [rival("noelle"), rival("ignored", { status: "ignored" })] }), { days: 90 });
    expect(result.rows.map((r) => [r.handle, r.videoCount])).toEqual([["ornek", 0], ["noelle", 1]]);
  });

  it("kendi hesapta video yoksa kendi bölümleri sebebiyle ölçülemez olarak işaretlenir", () => {
    const result = buildInsights(input([item({ owner: R1, daysAgo: 3, views: 100 })]));
    const sections = result.unmeasured.map((u) => u.section);
    expect(sections).toEqual(expect.arrayContaining(["duration_buckets", "cta_types", "posting", "hashtags", "voice"]));
    expect(result.unmeasured.find((u) => u.section === "cta_types")?.reason).toMatch(/90 günde kısa video yok/);
  });

  it("benzer boy havuzu: kendi takipçi ±3x içindeki izlenen rakipler; takipçi yoksa ölçülemez (0 değil)", () => {
    const pool = buildInsights(input([], { own: [own({ followers: 1_400 })], competitors: [rival("a", { followers: 4_000 }), rival("b", { followers: 20_000 }), rival("c", { followers: 600 })] }));
    expect(pool.similarSize).toEqual({ ownFollowers: 1_400, count: 2, handles: ["a", "c"] });
    const unknown = buildInsights(input([], { own: [own({ followers: undefined })] }));
    expect(unknown.similarSize.ownFollowers).toBeUndefined();
    expect(unknown.unmeasured.some((u) => u.section === "similar_size")).toBe(true);
  });

  it("accountId kendi tarafı daraltır; rakipler aynı kalır; gün sayısı kırpılır", () => {
    const two = [own(), own({ id: "own2", handle: "ikinci" })];
    const result = buildInsights(input([], { own: two }), { accountId: "own2", days: 1 });
    expect(result.rows.filter((r) => r.subjectKind === "own").map((r) => r.handle)).toEqual(["ikinci"]);
    expect(result.rows.filter((r) => r.subjectKind === "competitor")).toHaveLength(2);
    expect(result.scope).toMatchObject({ accountId: "own2", days: 7, audienceTimeZone: "America/New_York" });
  });

  it("insightsDays: varsayılan 90, 7..365'e kırpar", () => {
    expect([undefined, 1, 30, 1_000, Number.NaN].map(insightsDays)).toEqual([90, 7, 30, 365, 90]);
  });
});
