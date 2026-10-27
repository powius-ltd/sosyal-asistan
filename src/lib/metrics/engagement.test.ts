import { describe, expect, it } from "vitest";

import {
  BENCHMARK_SOURCE,
  benchmarkBand,
  computeEngagementStats,
  computeFormatBreakdown,
  computeReelPlayRate,
  contentEngagementRate,
  engagementOf,
  engagementRates,
  medianEngagementRate,
} from "@/lib/metrics/engagement";
import type { MetricItem } from "@/lib/metrics/types";
import type { ContentFormat } from "@/lib/platforms/types";

function it_(id: string, format: ContentFormat, likes?: number, comments?: number): MetricItem {
  return { id, format, likes, comments };
}

// Python fixture: likes/comments, followers = 3333. Python a5 ve a6'da eksik alanı 0 sayar; parite için
// burada 0 verilir (panelde eksik alan etkileşimi undefined yapar — aşağıdaki "sapma" testleri).
const A: MetricItem[] = [
  it_("a1", "image", 100, 10),
  it_("a2", "image", 200, 20),
  it_("a3", "carousel", 50, 5),
  it_("a4", "image"),
  it_("a5", "carousel", 7, 0),
  it_("a6", "short_video", 0, 3),
  it_("a7", "short_video", 333, 17),
];

describe("engagementOf", () => {
  it("ikisi de ölçülmüşse likes + comments (Python ContentItem.engagement ile aynı)", () => {
    expect(engagementOf({ likes: 100, comments: 10 })).toBe(110);
    expect(engagementOf({ likes: 0, comments: 0 })).toBe(0);
  });

  it("SAPMA: biri ya da ikisi ölçülemediyse undefined — eksik alan 0 sayılmaz (Python sayar)", () => {
    expect(engagementOf({})).toBeUndefined();
    expect(engagementOf({ likes: 7 })).toBeUndefined();
    expect(engagementOf({ comments: 3 })).toBeUndefined();
  });

  it("SAPMA: tek alanlı içerik istatistiğe girmez", () => {
    const partial = [it_("p1", "image", 100, 10), it_("p2", "image", 7, undefined), it_("p3", "image", undefined, 3)];
    expect(computeEngagementStats(partial, 1000)).toEqual({
      count: 1,
      meanEr: 11,
      medianEr: 11,
      meanEngagement: 110,
      medianEngagement: 110,
    });
    expect(engagementRates(partial, 1000)).toEqual([11]);
  });
});

describe("computeEngagementStats — Python paritesi", () => {
  it("takipçi var", () => {
    // Python 3.12: {count: 6, mean_er: 3.7254, median_er: 2.4752, mean_engagement: 124.2, median_engagement: 82.5}
    expect(computeEngagementStats(A, 3333)).toEqual({
      count: 6,
      meanEr: 3.7254,
      medianEr: 2.4752,
      meanEngagement: 124.2,
      medianEngagement: 82.5,
    });
  });

  it("takipçi yok → ER undefined, etkileşim hesaplanır", () => {
    const s = computeEngagementStats(A, undefined);
    expect(s.meanEr).toBeUndefined();
    expect(s.medianEr).toBeUndefined();
    expect(s.meanEngagement).toBe(124.2);
    expect(computeEngagementStats(A, 0).meanEr).toBeUndefined();
  });

  it("boş → count 0, gerisi undefined", () => {
    expect(computeEngagementStats([], 1000)).toEqual({ count: 0 });
    expect(computeEngagementStats([it_("x", "image")], 1000)).toEqual({ count: 0 });
  });

  it("Python test_engagement_stats_basic", () => {
    const s = computeEngagementStats(
      [it_("1", "image", 100, 10), it_("2", "image", 200, 20), it_("3", "image", 50, 5)],
      10_000,
    );
    expect(s.count).toBe(3);
    expect(s.meanEngagement).toBe(128.3);
    expect(s.medianEngagement).toBe(110);
  });

  it("engagementRates: 4 haneli yüzde", () => {
    expect(engagementRates(A.slice(0, 2), 3333)).toEqual([3.3003, 6.6007]);
    expect(engagementRates(A, undefined)).toEqual([]);
  });
});

describe("computeFormatBreakdown — Python paritesi", () => {
  it("formata göre, sayıya göre azalan (eşitlikte ilk görülen önce)", () => {
    expect(computeFormatBreakdown(A, 3333)).toEqual([
      { format: "image", count: 2, meanEr: 4.9505, medianEr: 4.9505 },
      { format: "carousel", count: 2, meanEr: 0.9301, medianEr: 0.9301 },
      { format: "short_video", count: 2, meanEr: 5.2955, medianEr: 5.2955 },
    ]);
  });
});

describe("computeReelPlayRate", () => {
  const reels: MetricItem[] = [
    { id: "r1", format: "short_video", views: 5000, viewsKind: "ig_play_count" },
    { id: "r2", format: "short_video", views: 15_000, viewsKind: "ig_play_count" },
    { id: "r3", format: "short_video", views: 1234, viewsKind: "ig_play_count" },
    { id: "r4", format: "short_video" },
  ];

  it("Python paritesi (tek viewsKind)", () => {
    // Python: {count: 3, mean_play_rate: 91.012, median_play_rate: 64.292}
    expect(computeReelPlayRate(reels, 7777)).toEqual([
      { viewsKind: "ig_play_count", count: 3, meanPlayRate: 91.012, medianPlayRate: 64.292 },
    ]);
    // Python test_reel_play_rate
    expect(computeReelPlayRate(reels.slice(0, 2), 10_000)[0].meanPlayRate).toBe(100);
  });

  it("takipçi yok → oran undefined, sayı var", () => {
    expect(computeReelPlayRate(reels, undefined)).toEqual([{ viewsKind: "ig_play_count", count: 3 }]);
  });

  it("farklı viewsKind'lar karışmaz; kısa video dışı sayılmaz", () => {
    const mixed: MetricItem[] = [
      ...reels,
      { id: "v1", format: "short_video", views: 100, viewsKind: "ig_view_count" },
      { id: "l1", format: "long_video", views: 9_999_999, viewsKind: "ig_play_count" },
      { id: "u1", format: "short_video", views: 100 },
    ];
    const out = computeReelPlayRate(mixed, 1000);
    expect(out.map((p) => [p.viewsKind, p.count])).toEqual([
      ["ig_play_count", 3],
      ["ig_view_count", 1],
    ]);
  });

  it("hiç views yok → []", () => {
    expect(computeReelPlayRate([], 1000)).toEqual([]);
  });
});

describe("benchmarkBand — Python paritesi", () => {
  it("bantlar (alt sınır dahil, üst hariç)", () => {
    const label = (f: number | undefined) => benchmarkBand(f)?.label;
    expect(label(0)).toBeUndefined();
    expect(label(undefined)).toBeUndefined();
    expect(label(1)).toBe("Nano (<10K)");
    expect(label(9999)).toBe("Nano (<10K)");
    expect(label(10_000)).toBe("Micro (10-50K)");
    expect(label(49_999)).toBe("Micro (10-50K)");
    expect(label(50_000)).toBe("Mid (50-500K)");
    expect(label(499_999)).toBe("Mid (50-500K)");
    expect(label(500_000)).toBe("Macro/Mega (500K+)");
    expect(label(12_000_000)).toBe("Macro/Mega (500K+)");
  });

  it("beklenen ER + kaynak dipnotu", () => {
    expect(benchmarkBand(30_000)).toEqual({ expectedErPct: 3.5, label: "Micro (10-50K)", source: BENCHMARK_SOURCE });
    expect(benchmarkBand(1_000_000)?.expectedErPct).toBe(0.65);
    expect(BENCHMARK_SOURCE).toContain("ARASTIRMA.md §3");
  });
});

describe("içerik etkileşim oranı ve medyanı (Genel bakış KPI'ı)", () => {
  it("(beğeni + yorum) / takipçi; ORAN döner, yüzde değil", () => {
    expect(contentEngagementRate({ likes: 80, comments: 20, followers: 1000 })).toBe(0.1);
    expect(contentEngagementRate({ likes: 0, comments: 0, followers: 1000 })).toBe(0);
  });

  it("beğeni ya da yorum eksikse, takipçi bilinmiyor/0/negatifse undefined (0 değil)", () => {
    expect(contentEngagementRate({ likes: 80, followers: 1000 })).toBeUndefined();
    expect(contentEngagementRate({ comments: 5, followers: 1000 })).toBeUndefined();
    expect(contentEngagementRate({ likes: 1, comments: 1 })).toBeUndefined();
    expect(contentEngagementRate({ likes: 1, comments: 1, followers: 0 })).toBeUndefined();
    expect(contentEngagementRate({ likes: 1, comments: 1, followers: -5 })).toBeUndefined();
    expect(contentEngagementRate({ likes: -5, comments: 1, followers: 100 })).toBeUndefined();
  });

  it("medyan: oranı hesaplanamayan içerik kümeden çıkar; pay ve payda aynı kümeden", () => {
    const items = [
      { likes: 10, comments: 0, followers: 1000 }, // 0,01
      { likes: 30, comments: 0, followers: 1000 }, // 0,03
      { likes: 90, comments: 10, followers: 1000 }, // 0,10
      { likes: 5000, followers: 1000 }, // yorum yok → hariç (payda da yok sayılır)
      { likes: 5, comments: 5 }, // takipçi yok → hariç
    ];
    expect(medianEngagementRate(items)).toBe(0.03);
    // Küme aynı olduğundan hariç tutulan içerik sonucu değiştirmez.
    expect(medianEngagementRate(items.slice(0, 3))).toBe(0.03);
  });

  it("farklı takipçili hesapların içeriklerini içerik başına orana çevirip medyan alır", () => {
    const items = [
      { likes: 100, comments: 0, followers: 1000 }, // 0,10
      { likes: 20, comments: 0, followers: 10_000 }, // 0,002
      { likes: 60, comments: 0, followers: 2000 }, // 0,03
    ];
    expect(medianEngagementRate(items)).toBe(0.03);
  });

  it("tek viral içerik medyanı bozmaz; hesaplanabilen içerik yoksa undefined", () => {
    const items = [...Array.from({ length: 4 }, () => ({ likes: 10, comments: 0, followers: 1000 })), { likes: 900_000, comments: 0, followers: 1000 }];
    expect(medianEngagementRate(items)).toBe(0.01);
    expect(medianEngagementRate([])).toBeUndefined();
    expect(medianEngagementRate([{ likes: 1, followers: 100 }])).toBeUndefined();
  });
});
