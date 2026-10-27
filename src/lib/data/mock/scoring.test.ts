import { describe, expect, it } from "vitest";

import type { ContentItem } from "@/lib/domain/content";
import { applyScores } from "@/lib/data/mock/scoring";
import type { ViewsKind } from "@/lib/platforms/types";

const NOW = new Date("2026-09-30T09:00:00Z").getTime();
const DAY = 86_400_000;

function item(id: string, ageDays: number, views: number | undefined, viewsKind: ViewsKind | undefined = "ig_play_count", extra: Partial<ContentItem> = {}): ContentItem {
  return {
    id,
    workspaceId: "ws",
    platform: "instagram",
    externalId: id,
    owner: { kind: "competitor", id: "cp_1", handle: "kahve", followers: 5000 },
    format: "short_video",
    publishedAt: new Date(NOW - ageDays * DAY).toISOString(),
    hashtags: [],
    missingFields: [],
    metrics: { views, viewsKind },
    score: { lowConfidence: true, immature: false },
    hasTranscript: false,
    firstSeenAt: new Date(NOW - ageDays * DAY).toISOString(),
    ...extra,
  } as ContentItem;
}

/** 12 olgun içerik (yaş 5..16), hepsi aynı izlenme. */
const history = (views: number | undefined, kind: ViewsKind | undefined = "ig_play_count") =>
  Array.from({ length: 12 }, (_, i) => item(`h${i}`, 5 + i, views, kind));

describe("applyScores: skor önbelleği ve açıklama aynı hesaplama anından", () => {
  it("her içerik için açıklama döner; medyan/n/lowConfidence önbellekle birebir aynı", () => {
    const items = [item("target", 1, 5000), ...history(1000)];
    const explanations = applyScores(items, NOW);
    expect([...explanations.keys()].sort()).toEqual(items.map((x) => x.id).sort());
    for (const c of items) {
      const b = explanations.get(c.id);
      expect(b?.medianViews, c.id).toBe(c.score.baselineViews);
      expect(b?.n, c.id).toBe(c.score.baselineN);
      expect(b?.lowConfidence, c.id).toBe(c.score.lowConfidence);
    }
    const target = items[0];
    expect(target.score.lift).toBe(5);
    expect(explanations.get("target")?.unmeasuredReason).toBeUndefined();
    expect(explanations.get("target")?.excluded.self).toBe(1);
  });

  it("excluded sayaçları aynı hesaplamadan saklanır (format, sabitlenmiş, izlenmesiz, tür)", () => {
    const items = [
      item("target", 1, 5000),
      ...history(1000),
      item("img", 9, 300, "ig_play_count", { format: "image" }),
      item("pin", 9, 9000, "ig_play_count", { isPinned: true }),
      item("nov", 9, undefined),
      item("kind", 9, 800, "ig_view_count"),
    ];
    const b = applyScores(items, NOW).get("target");
    expect(b?.excluded).toMatchObject({ self: 1, otherFormat: 1, pinned: 1, noViews: 1, differentViewsKind: 1 });
    expect(b?.n).toBe(12);
  });
});

describe("baz çizgisi açıklamasında ölçülemedi sebebi", () => {
  it("baz çizgisi medyanı 0 → sebep yazılır, lift undefined", () => {
    const items = [item("target", 1, 5000), ...history(0)];
    const b = applyScores(items, NOW).get("target");
    expect(b?.medianViews).toBe(0);
    expect(items[0].score.lift).toBeUndefined();
    expect(b?.unmeasuredReason).toMatch(/medyan.*0/);
  });

  it("hedefin izlenme türü bilinmiyorsa 'izlenme türü bilinmiyor'", () => {
    // Not: `item(..., undefined)` varsayılan türe düşer; bilinmeyen türü metrics ile açıkça veriyoruz.
    const items = [item("target", 1, 5000, "ig_play_count", { metrics: { views: 5000, extra: {} } }), ...history(1000)];
    const b = applyScores(items, NOW).get("target");
    expect(items[0].score.lift).toBeUndefined();
    expect(b?.unmeasuredReason).toContain("İzlenme türü bilinmiyor");
  });

  it("izlenmesi ölçülemeyen hedef ve baz çizgisi boş hedef için ayrı sebepler", () => {
    const noViews = applyScores([item("target", 1, undefined), ...history(1000)], NOW).get("target");
    expect(noViews?.unmeasuredReason).toMatch(/izlenme ölçülemedi/);
    const alone = applyScores([item("target", 1, 5000)], NOW).get("target");
    expect(alone?.n).toBe(0);
    expect(alone?.unmeasuredReason).toMatch(/3 günden eski/);
  });
});
