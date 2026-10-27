import { describe, expect, it } from "vitest";

import type { ContentItem } from "@/lib/domain/content";
import { BEST_TIMES_LOOKBACK_DAYS } from "@/lib/domain/overview";
import { buildBestTimes } from "@/lib/data/views/best-times";
import { DAY_MS } from "@/lib/time";

const NOW = Date.parse("2026-09-30T12:00:00Z");
const TZ = "UTC";

/** Belirli gün önce, belirli saatte (UTC) yayınlanmış kendi kısa videosu. */
function video(id: string, daysAgo: number, hour: number, views: number | undefined, over: Partial<ContentItem> = {}): ContentItem {
  const day = new Date(NOW - daysAgo * DAY_MS);
  day.setUTCHours(hour, 0, 0, 0);
  return {
    id,
    format: "short_video",
    publishedAt: day.toISOString(),
    metrics: { views, viewsKind: views === undefined ? undefined : "ig_views" },
    score: { immature: false },
    ...over,
  } as unknown as ContentItem;
}

describe("buildBestTimes", () => {
  it("aynı gün + saatte ≥3 paylaşım: dilim medyan izlenmeyle döner (sebep yok)", () => {
    // 7 gün arayla aynı gün, aynı saat: 3 paylaşım.
    const items = [video("a", 10, 9, 100), video("b", 17, 9, 300), video("c", 24, 9, 200)];
    const result = buildBestTimes(items, TZ, NOW);
    expect(result.bestTimesUnmeasuredReason).toBeUndefined();
    expect(result.bestTimes).toHaveLength(1);
    expect(result.bestTimes?.[0]).toMatchObject({ hour: 9, medianViews: 200, n: 3 });
  });

  it("izlenmesi ölçülmüş kısa video yoksa sebep 'yok' der; bestTimes undefined (boş liste/0 değil)", () => {
    const result = buildBestTimes([video("a", 10, 9, undefined)], TZ, NOW);
    expect(result.bestTimes).toBeUndefined();
    expect(result.bestTimesUnmeasuredReason).toBe(`Son ${BEST_TIMES_LOOKBACK_DAYS} günde izlenmesi ölçülmüş, olgunlaşmış kendi kısa videon yok.`);
    expect(buildBestTimes([], TZ, NOW).bestTimesUnmeasuredReason).toMatch(/kendi kısa videon yok/);
  });

  it("video var ama hiçbir dilimde 3 paylaşım yoksa sebep incelenen sayıyı ve eşiği söyler", () => {
    const items = [video("a", 10, 9, 100), video("b", 11, 14, 300)];
    const result = buildBestTimes(items, TZ, NOW);
    expect(result.bestTimes).toBeUndefined();
    expect(result.bestTimesUnmeasuredReason).toBe(`Son ${BEST_TIMES_LOOKBACK_DAYS} günde 2 kısa video incelendi; aynı gün ve saatte en az 3 video yayınlanan zaman dilimi yok.`);
  });

  it("olgunlaşmamış ve arama penceresi (90 gün) dışındaki içerik girmez", () => {
    const items = [
      video("old", BEST_TIMES_LOOKBACK_DAYS + 3, 9, 100),
      video("old2", BEST_TIMES_LOOKBACK_DAYS + 10, 9, 100),
      video("old3", BEST_TIMES_LOOKBACK_DAYS + 17, 9, 100),
      video("young", 7, 9, 100, { score: { immature: true } } as Partial<ContentItem>),
    ];
    expect(buildBestTimes(items, TZ, NOW).bestTimes).toBeUndefined();
    expect(buildBestTimes(items, TZ, NOW).bestTimesUnmeasuredReason).toMatch(/kendi kısa videon yok/);
  });

  it("dilimler workspace saat diliminde hesaplanır", () => {
    const items = [video("a", 10, 22, 100), video("b", 17, 22, 300), video("c", 24, 22, 200)];
    // 22:00 UTC = ertesi gün 01:00 Europe/Istanbul (UTC+3).
    expect(buildBestTimes(items, "Europe/Istanbul", NOW).bestTimes?.[0]?.hour).toBe(1);
    expect(buildBestTimes(items, "UTC", NOW).bestTimes?.[0]?.hour).toBe(22);
  });
});
