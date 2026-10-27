import { describe, expect, it } from "vitest";

import { assignTiers, tierFromPercentile, topAndBottom, type TieredItem } from "@/lib/metrics/tiers";
import type { MetricItem } from "@/lib/metrics/types";

function img(id: string, likes?: number, comments?: number): MetricItem {
  return { id, format: "image", likes, comments };
}

// Python fixture (outliers.assign_tiers, metric="engagement"): engagement = likes + comments.
const ITEMS: MetricItem[] = [
  img("t1", 2000, 200),
  img("t2", 10, 1),
  img("t3", 500, 50),
  img("t4", 5, 0),
  img("t5", 1000, 100),
  img("t6"),
  img("t7", 500, 50),
  img("t8", 0, 0),
];

describe("assignTiers — Python paritesi", () => {
  it("persentil + dilim + sıra birebir", () => {
    const tiered = assignTiers(ITEMS);
    // Python 3.12 çıktısı
    expect(tiered.map((t) => [t.item.id, t.metricValue, t.percentile, t.tier])).toEqual([
      ["t1", 2200, 100, "top"],
      ["t5", 1100, 83.3, "top"],
      ["t3", 550, 50, "mid"],
      ["t7", 550, 50, "mid"],
      ["t2", 11, 33.3, "mid"],
      ["t4", 5, 16.7, "bottom"],
      ["t8", 0, 0, "bottom"],
    ]);
  });

  it("boş → []; tek içerik → 50 / mid", () => {
    expect(assignTiers([])).toEqual([]);
    expect(assignTiers([img("x")])).toEqual([]);
    const single = assignTiers([ITEMS[0]]);
    expect(single.map((t) => [t.item.id, t.percentile, t.tier])).toEqual([["t1", 50, "mid"]]);
  });

  it("views metriği yalnız verilen viewsKind içinde (Python play_count)", () => {
    const reels: MetricItem[] = [
      { id: "p1", format: "short_video", views: 900, viewsKind: "ig_play_count" },
      { id: "p2", format: "short_video", views: 100, viewsKind: "ig_play_count" },
      { id: "p3", format: "short_video", views: 500, viewsKind: "ig_play_count" },
      { id: "p4", format: "short_video" },
      { id: "p5", format: "short_video", views: 99_999, viewsKind: "ig_view_count" },
    ];
    const tiered = assignTiers(reels, { metric: "views", viewsKind: "ig_play_count" });
    expect(tiered.map((t) => [t.item.id, t.metricValue, t.percentile, t.tier])).toEqual([
      ["p1", 900, 100, "top"],
      ["p3", 500, 50, "mid"],
      ["p2", 100, 0, "bottom"],
    ]);
  });
});

describe("tierFromPercentile", () => {
  it("≥75 top, ≤25 bottom", () => {
    expect(tierFromPercentile(75)).toBe("top");
    expect(tierFromPercentile(74.9)).toBe("mid");
    expect(tierFromPercentile(25.1)).toBe("mid");
    expect(tierFromPercentile(25)).toBe("bottom");
  });
});

describe("topAndBottom — Python paritesi", () => {
  const tiered = assignTiers(ITEMS);
  const ids = (o: { top: TieredItem<MetricItem>[]; bottom: TieredItem<MetricItem>[] }) => [
    o.top.map((t) => t.item.id),
    o.bottom.map((t) => t.item.id),
  ];

  it("Python çıktılarıyla birebir (kısa listede çakışma dahil)", () => {
    expect(ids(topAndBottom(tiered, { topN: 2, bottomN: 2 }))).toEqual([["t1", "t5"], ["t4", "t8"]]);
    expect(ids(topAndBottom(tiered, { topN: 5, bottomN: 4 }))).toEqual([
      ["t1", "t5", "t3", "t7", "t2"],
      ["t7", "t2", "t4", "t8"],
    ]);
    expect(ids(topAndBottom(tiered, { topN: 7, bottomN: 3 }))).toEqual([
      ["t1", "t5", "t3", "t7", "t2", "t4", "t8"],
      [],
    ]);
    expect(ids(topAndBottom(tiered, { topN: 9, bottomN: 2 }))[1]).toEqual([]);
  });

  it("boş liste → iki boş grup", () => {
    expect(topAndBottom([], { topN: 3, bottomN: 3 })).toEqual({ top: [], bottom: [] });
  });

  it("bilinçli sapma: bottomN = 0 → boş (Python lst[-0:] tüm listeyi verir)", () => {
    expect(topAndBottom(tiered, { topN: 2, bottomN: 0 }).bottom).toEqual([]);
  });
});
