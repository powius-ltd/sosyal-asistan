import { describe, expect, it } from "vitest";

import { scoreAccount } from "@/lib/metrics/score-account";
import type { ScorableItem } from "@/lib/metrics/types";

const NOW = new Date("2026-09-30T12:00:00Z");
const DAY = 86_400_000;

function reel(id: string, age: number | undefined, views: number | undefined, extra: Partial<ScorableItem> = {}): ScorableItem {
  return {
    id,
    format: "short_video",
    publishedAt: age === undefined ? undefined : new Date(NOW.getTime() - age * DAY),
    views,
    viewsKind: "ig_play_count",
    ...extra,
  };
}

// 12 olgun kısa video (yaş 4..15 gün), views 1000 → baz çizgisi medyanı 1000 (kendisi hariç 11 içerik).
const MATURE = Array.from({ length: 12 }, (_, i) => reel(`m${i}`, i + 4, 1000));

describe("scoreAccount", () => {
  it("her içerik için baz çizgisi + lift + kademe + güven + olgunluk + crossScore", () => {
    const items = [
      ...MATURE,
      reel("hit", 5, 5200),
      reel("fresh", 1, 3100),
      reel("pinned", 30, 80_000, { isPinned: true }),
    ];
    const scores = scoreAccount(items, 10_000, NOW);
    expect(scores.size).toBe(items.length);

    const hit = scores.get("hit");
    expect(hit).toMatchObject({
      viewsKind: "ig_play_count",
      baselineViews: 1000,
      baselineN: 12,
      lift: 5.2,
      liftTier: 4,
      lowConfidence: false,
      immature: false,
    });
    expect(hit?.crossScore).toBeCloseTo(Math.log(0.52) * Math.log(10_000), 12);

    // Genç içerik: kendi lift'i hesaplanır ama "olgunlaşmadı" işaretlenir; başkalarının baz çizgisine girmez.
    expect(scores.get("fresh")).toMatchObject({ lift: 3.1, liftTier: 3, immature: true, baselineN: 13 });
    // Sabitlenmiş içerik diğerlerinin baz çizgisini şişirmez.
    expect(scores.get("m0")?.baselineViews).toBe(1000);
    expect(scores.get("pinned")?.liftTier).toBe(4);
  });

  it("farklı format / viewsKind ayrı baz çizgisi kullanır", () => {
    const items = [
      ...MATURE,
      reel("view-kind", 5, 2000, { viewsKind: "ig_view_count" }),
      reel("image", 5, 2000, { format: "image" }),
    ];
    const scores = scoreAccount(items, 10_000, NOW);
    expect(scores.get("view-kind")).toMatchObject({ baselineN: 0, lowConfidence: true });
    expect(scores.get("view-kind")?.baselineViews).toBeUndefined();
    expect(scores.get("view-kind")?.lift).toBeUndefined();
    expect(scores.get("view-kind")?.liftTier).toBeUndefined();
    expect(scores.get("image")?.baselineN).toBe(0);
    expect(scores.get("m0")?.baselineN).toBe(11);
  });

  it("n < 10 → düşük güven; lift yine hesaplanır", () => {
    const items = [...MATURE.slice(0, 5), reel("t", 5, 2000)];
    expect(scores(items).get("t")).toMatchObject({ baselineN: 5, lowConfidence: true, lift: 2, liftTier: 2 });
  });

  it("ölçülemeyen alanlar undefined kalır (asla 0)", () => {
    const items = [...MATURE, reel("noviews", 5, undefined), reel("nodate", undefined, 1500)];
    const s = scoreAccount(items, undefined, NOW);
    expect(s.get("noviews")).toMatchObject({ baselineViews: 1000, lowConfidence: false, immature: false });
    expect(s.get("noviews")?.lift).toBeUndefined();
    expect(s.get("noviews")?.liftTier).toBeUndefined();
    expect(s.get("noviews")?.crossScore).toBeUndefined();
    // Tarihi bilinmeyen: genç olduğu gösterilemez, kendi lift'i hesaplanır ama başkasının baz çizgisine girmez.
    expect(s.get("nodate")).toMatchObject({ immature: false, lift: 1.5, liftTier: 1 });
    expect(s.get("m0")?.baselineN).toBe(11);
  });

  it("baz çizgisi medyanı 0 → lift undefined", () => {
    const zeros = Array.from({ length: 10 }, (_, i) => reel(`z${i}`, i + 4, 0));
    const s = scoreAccount([...zeros, reel("t", 5, 100)], 1000, NOW);
    expect(s.get("t")?.baselineViews).toBe(0);
    expect(s.get("t")?.lift).toBeUndefined();
  });

  it("deterministik: aynı girdi → aynı çıktı, girdi sırasından bağımsız", () => {
    const items = [...MATURE, reel("hit", 5, 5200), reel("fresh", 1, 3100)];
    const a = scoreAccount(items, 10_000, NOW);
    const b = scoreAccount([...items].reverse(), 10_000, NOW);
    for (const [id, score] of a) expect(b.get(id)).toEqual(score);
  });

  it("boş liste → boş Map", () => {
    expect(scoreAccount([], 100, NOW).size).toBe(0);
  });
});

function scores(items: ScorableItem[]) {
  return scoreAccount(items, 10_000, NOW);
}
