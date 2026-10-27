import { describe, expect, it } from "vitest";

import { buildAccountPackage, tieredContent } from "@/lib/metrics/account-package";
import { BENCHMARK_SOURCE } from "@/lib/metrics/engagement";
import type { MetricItem } from "@/lib/metrics/types";
import type { ContentFormat } from "@/lib/platforms/types";

function post(
  id: string,
  format: ContentFormat,
  caption: string,
  hashtags: string[],
  likes: number | undefined,
  comments: number | undefined,
  iso: string,
): MetricItem {
  return { id, format, caption, hashtags, likes, comments, publishedAt: new Date(iso) };
}

function reel(
  id: string,
  views: number,
  durationSec: number,
  likes: number,
  comments: number,
  caption: string,
  hashtags: string[],
  iso: string,
): MetricItem {
  return {
    ...post(id, "short_video", caption, hashtags, likes, comments, iso),
    views,
    viewsKind: "ig_play_count",
    durationSec,
  };
}

// Python fixture: NormalizedBundle (Image → image, Sidecar → carousel, Reel → short_video + play_count).
const ITEMS: MetricItem[] = [
  post("P1", "image", "Günaydın ☀️ #kahve #sabah", ["#kahve", "#sabah"], 410, 12, "2026-09-28T06:30:00Z"),
  post("P2", "carousel", "Menü değişti, kaydır 👉 #kahve #menü", ["#kahve", "#menü"], 620, 41, "2026-09-21T17:05:00Z"),
  post("P3", "image", "#kahve", ["#kahve"], 150, 3, "2026-08-15T09:00:00Z"),
  post("P4", "image", "Hafta sonu kapalıyız.", [], undefined, undefined, "2026-07-02T11:45:00Z"),
  // Python fixture'ında P5'in yorumu None (=0 sayılır). Panelde yorum ölçülemediyse etkileşim yoktur
  // (bkz. engagement.ts sapması); Python paritesi için burada 0 verilir, sapma engagement.test.ts'te sınanır.
  post("P5", "carousel", "Latte art denemeleri #kahve #latteart #sabah", ["#kahve", "#latteart", "#sabah"], 290, 0, "2026-06-10T08:10:00Z"),
  reel("R1", 24_000, 14.2, 1300, 88, "3 saniyede latte 🎬 #kahve #reels", ["#kahve", "#reels"], "2026-09-29T19:00:00Z"),
  reel("R2", 6100, 31, 240, 9, "Barista günlüğü #sabah", ["#sabah"], "2026-09-18T07:20:00Z"),
  reel("R3", 9800, 22.5, 515, 30, "Soğuk demleme nasıl yapılır? #kahve #tarif #reels", ["#kahve", "#tarif", "#reels"], "2026-08-30T20:45:00Z"),
  reel("R4", 3100, 58, 120, 4, "", [], "2026-07-25T12:00:00Z"),
];

describe("buildAccountPackage — Python package.py paritesi", () => {
  it("timeZone UTC ile Python build_metrics_package çıktısının birebir karşılığı", () => {
    const pkg = buildAccountPackage({
      handle: "kahvecininyeri",
      followers: 12_000,
      missingFields: ["post p4: etkileşim sayıları eksik"],
      items: ITEMS,
      commentsCount: 0,
      timeZone: "UTC",
    });
    expect(pkg).toEqual({
      handle: "kahvecininyeri",
      followers: 12_000,
      missingFields: ["post p4: etkileşim sayıları eksik"],
      timeZone: "UTC",
      engagement: {
        overall: { count: 8, meanEr: 3.9917, medianEr: 2.9667, meanEngagement: 479, medianEngagement: 356 },
        posts: { count: 4, meanEr: 3.1792, medianEr: 2.9667, meanEngagement: 381.5, medianEngagement: 356 },
        reels: { count: 4, meanEr: 4.8042, medianEr: 3.3083, meanEngagement: 576.5, medianEngagement: 397 },
      },
      formatBreakdown: [
        { format: "short_video", count: 4, meanEr: 4.8042, medianEr: 3.3083 },
        { format: "image", count: 2, meanEr: 2.3959, medianEr: 2.3959 },
        { format: "carousel", count: 2, meanEr: 3.9625, medianEr: 3.9625 },
      ],
      reelPlayRate: [{ viewsKind: "ig_play_count", count: 4, meanPlayRate: 89.583, medianPlayRate: 66.25 }],
      benchmark: { expectedErPct: 3.5, label: "Micro (10-50K)", source: BENCHMARK_SOURCE },
      cadence: { totalItems: 9, spanDays: 111, postsPerWeek: 0.57, longestGapDays: 23 },
      heatmap: {
        Pzt: { 6: 1, 17: 1 },
        Sal: { 19: 1 },
        Çar: { 8: 1 },
        Per: { 11: 1 },
        Cum: { 7: 1 },
        Cmt: { 9: 1, 12: 1 },
        Paz: { 20: 1 },
      },
      bestHours: [],
      trend: {
        last30Days: { recentMedianEr: 4.5417, previousMedianEr: 1.275, direction: "up" },
        last90Days: { recentMedianEr: 3.5167, previousMedianEr: 2.4167, direction: "up" },
      },
      correlations: {
        captionLengthVsEngagement: { label: "caption_uzunlugu_vs_etkilesim", pearsonR: 0.443, n: 8 },
        hashtagCountVsEngagement: { label: "hashtag_sayisi_vs_etkilesim", pearsonR: 0.383, n: 8 },
        durationVsViews: [{ label: "sure_vs_izlenme", pearsonR: -0.799, n: 4, viewsKind: "ig_play_count" }],
      },
      topHashtags: [
        { tag: "#kahve", uses: 6, medianEngagement: 483.5, meanEngagement: 576.5 },
        { tag: "#sabah", uses: 3, medianEngagement: 290, meanEngagement: 320.3 },
      ],
      sampleSizes: { posts: 5, reels: 4, comments: 0, postTiersComputed: 4, reelTiersComputed: 4 },
    });
  });

  it("takipçi ve yorum sayısı bilinmiyorsa ilgili alanlar undefined (0 değil)", () => {
    const pkg = buildAccountPackage({ handle: "x", items: ITEMS });
    expect(pkg.followers).toBeUndefined();
    expect(pkg.benchmark).toBeUndefined();
    expect(pkg.engagement.overall.meanEr).toBeUndefined();
    expect(pkg.engagement.overall.meanEngagement).toBe(479);
    expect(pkg.trend.last30Days).toEqual({});
    expect(pkg.sampleSizes.comments).toBeUndefined();
    expect(pkg.missingFields).toEqual([]);
    expect(pkg.timeZone).toBe("Europe/Istanbul");
  });

  it("long_video genel toplamda ve format kırılımında, posts/reels'de değil", () => {
    const long: MetricItem = { id: "L1", format: "long_video", likes: 10, comments: 0 };
    const pkg = buildAccountPackage({ handle: "x", followers: 1000, items: [...ITEMS, long] });
    expect(pkg.engagement.overall.count).toBe(9);
    expect(pkg.engagement.posts.count).toBe(4);
    expect(pkg.engagement.reels.count).toBe(4);
    expect(pkg.formatBreakdown.find((f) => f.format === "long_video")?.count).toBe(1);
  });

  it("boş hesap çökmez", () => {
    const pkg = buildAccountPackage({ handle: "boş", followers: 500, items: [] });
    expect(pkg.engagement.overall).toEqual({ count: 0 });
    expect(pkg.cadence).toEqual({ totalItems: 0 });
    expect(pkg.reelPlayRate).toEqual([]);
    expect(pkg.topHashtags).toEqual([]);
    expect(pkg.correlations.durationVsViews).toEqual([]);
  });
});

describe("tieredContent (Python get_tiered_content)", () => {
  it("posts / reels etkileşime göre, reels views'a göre viewsKind başına", () => {
    const t = tieredContent(ITEMS);
    expect(t.posts.map((x) => [x.item.id, x.tier])).toEqual([
      ["P2", "top"],
      ["P1", "mid"],
      ["P5", "mid"],
      ["P3", "bottom"],
    ]);
    expect(t.reels.map((x) => x.item.id)).toEqual(["R1", "R3", "R2", "R4"]);
    expect(t.reelsByViews).toHaveLength(1);
    expect(t.reelsByViews[0].viewsKind).toBe("ig_play_count");
    expect(t.reelsByViews[0].tiers.map((x) => [x.item.id, x.metricValue, x.percentile])).toEqual([
      ["R1", 24_000, 100],
      ["R3", 9800, 66.7],
      ["R2", 6100, 33.3],
      ["R4", 3100, 0],
    ]);
  });
});
