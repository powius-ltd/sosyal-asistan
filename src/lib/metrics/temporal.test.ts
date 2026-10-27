import { describe, expect, it } from "vitest";

import {
  BEST_SLOT_MIN_POSTS,
  bestPostingHours,
  bestPostingSlots,
  computeCadence,
  computeHeatmap,
  computeTrend,
  pyWeekdayFromJsDay,
  WEEKDAY_LABELS,
  zonedWeekdayHour,
} from "@/lib/metrics/temporal";
import type { MetricItem } from "@/lib/metrics/types";

const DAY = 86_400_000;
const NOW = new Date("2026-09-30T12:00:00Z");

// Python fixture'ları yalnız beğeni verir (yorum 0 sayılır). Panelde yorum ölçülmemişse etkileşim
// undefined'dır (engagement.ts sapması); parite için yorum burada açıkça 0 verilir.
function at(
  id: string,
  iso: string | undefined,
  likes?: number,
  comments: number | undefined = likes === undefined ? undefined : 0,
): MetricItem {
  return { id, format: "image", publishedAt: iso ? new Date(iso) : undefined, likes, comments };
}

function daysAgo(id: string, days: number, likes: number): MetricItem {
  return { id, format: "image", publishedAt: new Date(NOW.getTime() - days * DAY), likes, comments: 0 };
}

// Python fixture (temporal.compute_cadence / compute_heatmap)
const D: MetricItem[] = [
  at("d1", "2026-09-01T08:15:00Z", 10, 1),
  at("d2", "2026-09-03T21:40:00Z", 20, 2),
  { ...at("d3", "2026-09-07T23:59:00Z", 30, 3), format: "short_video" },
  at("d4", "2026-09-13T10:00:00Z", 40, 4),
  { ...at("d5", "2026-09-20T22:30:00Z", 50, 5), format: "carousel" },
  at("d6", undefined, 60, 6),
];

describe("weekday eşlemesi", () => {
  it("JS getDay (Paz=0) → Python weekday (Pzt=0)", () => {
    expect(pyWeekdayFromJsDay(0)).toBe(6);
    expect(pyWeekdayFromJsDay(1)).toBe(0);
    expect(pyWeekdayFromJsDay(6)).toBe(5);
    expect(WEEKDAY_LABELS[pyWeekdayFromJsDay(0)]).toBe("Paz");
  });

  it("zonedWeekdayHour UTC'de getUTCDay eşlemesiyle aynı (bir hafta boyunca)", () => {
    for (let i = 0; i < 7; i++) {
      const d = new Date(Date.UTC(2026, 8, 28 + i, 13, 5));
      expect(zonedWeekdayHour(d, "UTC")).toEqual({ weekday: pyWeekdayFromJsDay(d.getUTCDay()), hour: 13 });
    }
  });

  it("saat dilimi günü ve saati kaydırır (varsayılan Europe/Istanbul, UTC+3)", () => {
    // Pazar 22:30 UTC = Pazartesi 01:30 İstanbul
    const d = new Date("2026-09-20T22:30:00Z");
    expect(zonedWeekdayHour(d, "UTC")).toEqual({ weekday: 6, hour: 22 });
    expect(zonedWeekdayHour(d)).toEqual({ weekday: 0, hour: 1 });
  });
});

describe("computeCadence — Python paritesi", () => {
  it("aralık, haftalık paylaşım, en uzun boşluk", () => {
    expect(computeCadence(D)).toEqual({ totalItems: 6, spanDays: 19, postsPerWeek: 1.84, longestGapDays: 7 });
  });

  it("tarihi bilinen < 2 → yalnız toplam", () => {
    expect(computeCadence(D.slice(0, 1))).toEqual({ totalItems: 1 });
    expect(computeCadence([])).toEqual({ totalItems: 0 });
  });

  it("aynı gün → aralık 1 gün (Python `or 1`)", () => {
    const same = [at("s1", "2026-09-01T08:00:00Z", 1, 1), at("s2", "2026-09-01T20:00:00Z", 1, 1)];
    expect(computeCadence(same)).toEqual({ totalItems: 2, spanDays: 1, postsPerWeek: 14, longestGapDays: 0 });
  });
});

describe("computeHeatmap", () => {
  it("timeZone UTC → Python çıktısıyla birebir", () => {
    expect(computeHeatmap(D, "UTC")).toEqual({
      Pzt: { 23: 1 },
      Sal: { 8: 1 },
      Çar: {},
      Per: { 21: 1 },
      Cum: {},
      Cmt: {},
      Paz: { 10: 1, 22: 1 },
    });
  });

  it("varsayılan Europe/Istanbul: gece yarısına yakın paylaşımlar ertesi güne kayar", () => {
    expect(computeHeatmap(D)).toEqual({
      Pzt: { 1: 1 },
      Sal: { 11: 1, 2: 1 },
      Çar: {},
      Per: {},
      Cum: { 0: 1 },
      Cmt: {},
      Paz: { 13: 1 },
    });
  });
});

describe("computeTrend — Python paritesi (eşik ±%10)", () => {
  // Python fixture: (gün önce, beğeni), takipçi 5000. Referans an = en son içerik.
  const spec: [number, number][] = [
    [0, 300], [5, 280], [12, 260], [29, 240], [30, 100], [31, 90], [45, 110],
    [59, 100], [60, 50], [61, 55], [80, 60], [100, 400], [150, 500],
  ];
  const TR = spec.map(([d, e], i) => daysAgo(`tr${i}`, d, e));

  it("30 gün: yukarı (tam 30 gün önceki içerik önceki pencerede)", () => {
    expect(computeTrend(TR, 5000, { windowDays: 30 })).toEqual({
      recentMedianEr: 5.4,
      previousMedianEr: 2,
      direction: "up",
    });
  });

  it("90 gün: aşağı", () => {
    expect(computeTrend(TR, 5000, { windowDays: 90 })).toEqual({
      recentMedianEr: 2,
      previousMedianEr: 9,
      direction: "down",
    });
  });

  it("sabit / aşağı / sınırda yukarı", () => {
    expect(computeTrend([daysAgo("f1", 0, 105), daysAgo("f2", 40, 100)], 1000)).toEqual({
      recentMedianEr: 10.5,
      previousMedianEr: 10,
      direction: "flat",
    });
    expect(computeTrend([daysAgo("g1", 0, 80), daysAgo("g2", 40, 100)], 1000).direction).toBe("down");
    expect(computeTrend([daysAgo("u1", 0, 111), daysAgo("u2", 40, 100)], 1000).direction).toBe("up");
  });

  it("takipçi yok / içerik yok / önceki pencere boş → yön undefined (Python 'bilinmiyor')", () => {
    expect(computeTrend(TR, undefined)).toEqual({});
    expect(computeTrend([], 1000)).toEqual({});
    const onlyRecent = computeTrend([daysAgo("a", 0, 10), daysAgo("b", 3, 10)], 1000);
    expect(onlyRecent.direction).toBeUndefined();
    expect(onlyRecent.previousMedianEr).toBeUndefined();
    expect(onlyRecent.recentMedianEr).toBe(1);
  });

  it("referans an içeriklerden gelir: aynı veri her zaman aynı sonucu verir", () => {
    const shifted = TR.map((it) => ({ ...it, publishedAt: new Date((it.publishedAt?.getTime() ?? 0) - 400 * DAY) }));
    expect(computeTrend(shifted, 5000)).toEqual(computeTrend(TR, 5000));
  });
});

describe("bestPostingHours", () => {
  const items: MetricItem[] = [
    at("a", "2026-09-01T09:05:00Z", 100),
    at("b", "2026-09-02T09:40:00Z", 200),
    at("c", "2026-09-03T09:10:00Z", 300),
    at("d", "2026-09-01T18:00:00Z", 400),
    at("e", "2026-09-02T18:30:00Z", 50),
    at("f", "2026-09-03T18:59:00Z", 500),
    at("g", "2026-09-04T21:00:00Z", 9999),
    at("h", "2026-09-05T21:00:00Z", 9999),
    at("noeng", "2026-09-06T09:00:00Z"),
    at("nodate", undefined, 99_999),
  ];

  it("en az 3 paylaşımlı saatler, medyan etkileşime göre azalan", () => {
    expect(bestPostingHours(items, { timeZone: "UTC" })).toEqual([
      { hour: 18, posts: 3, medianEngagement: 400 },
      { hour: 9, posts: 3, medianEngagement: 200 },
    ]);
  });

  it("varsayılan saat dilimi Europe/Istanbul", () => {
    expect(bestPostingHours(items).map((h) => h.hour)).toEqual([21, 12]);
  });

  it("minPosts ayarlanabilir; veri yoksa []", () => {
    expect(bestPostingHours(items, { timeZone: "UTC", minPosts: 2 })[0]).toEqual({
      hour: 21,
      posts: 2,
      medianEngagement: 9999,
    });
    expect(bestPostingHours([])).toEqual([]);
  });
});

describe("bestPostingSlots", () => {
  // 2026-09-01 Salı, 2026-09-08 Salı, 2026-09-15 Salı (UTC 09:xx); 2026-09-02 Çarşamba.
  const reel = (iso: string | undefined, views: number | undefined, viewsKind: MetricItem["viewsKind"] = "ig_views") => ({
    format: "short_video" as const,
    views,
    viewsKind,
    publishedAt: iso ? new Date(iso) : undefined,
  });
  const tuesdays = [reel("2026-09-01T09:05:00Z", 100), reel("2026-09-08T09:40:00Z", 300), reel("2026-09-15T09:10:00Z", 200)];
  const wednesdays = [reel("2026-09-02T18:00:00Z", 900), reel("2026-09-09T18:30:00Z", 800), reel("2026-09-16T18:59:00Z", 1000)];

  it("gün × saat dilimi: en az 3 paylaşım, medyan izlenmeye göre azalan; gün Pzt = 0, saat verilen saat diliminde", () => {
    const utc = bestPostingSlots([...tuesdays, ...wednesdays], { timeZone: "UTC" });
    expect(utc.slots).toEqual([
      { weekday: 2, hour: 18, posts: 3, medianViews: 900 },
      { weekday: 1, hour: 9, posts: 3, medianViews: 200 },
    ]);
    expect(utc).toMatchObject({ viewsKind: "ig_views", considered: 6 });
    // Europe/Istanbul (UTC+3): saatler +3, gün değişmez (09:xx → 12, 18:xx → 21).
    expect(bestPostingSlots([...tuesdays, ...wednesdays]).slots.map((s) => [s.weekday, s.hour])).toEqual([[2, 21], [1, 12]]);
  });

  it("gün sınırı saat diliminde kayar (UTC 22:30 Salı = İstanbul 01:30 Çarşamba)", () => {
    const late = ["2026-09-01T22:30:00Z", "2026-09-08T22:30:00Z", "2026-09-15T22:30:00Z"].map((iso) => reel(iso, 50));
    expect(bestPostingSlots(late, { timeZone: "UTC" }).slots[0]).toMatchObject({ weekday: 1, hour: 22 });
    expect(bestPostingSlots(late).slots[0]).toMatchObject({ weekday: 2, hour: 1 });
  });

  it("yetersiz veri: 3'ten az paylaşımlı dilim yok sayılır (boş liste, 0 ya da rastgele dilim değil); minPosts ve limit ayarlanabilir", () => {
    expect(BEST_SLOT_MIN_POSTS).toBe(3);
    expect(bestPostingSlots(tuesdays.slice(0, 2), { timeZone: "UTC" })).toEqual({ slots: [], viewsKind: "ig_views", considered: 2 });
    expect(bestPostingSlots(tuesdays.slice(0, 2), { timeZone: "UTC", minPosts: 2 }).slots).toEqual([{ weekday: 1, hour: 9, posts: 2, medianViews: 200 }]);
    expect(bestPostingSlots([...tuesdays, ...wednesdays], { timeZone: "UTC", limit: 1 }).slots).toHaveLength(1);
    expect(bestPostingSlots([])).toEqual({ slots: [], considered: 0 });
  });

  it("izlenmesi ölçülmemiş, tarihsiz, kısa video olmayan içerik ve baskın olmayan views türü girmez", () => {
    const noise = [
      reel("2026-09-22T09:00:00Z", undefined),
      reel(undefined, 999_999),
      { format: "image" as const, views: 999_999, viewsKind: "ig_views" as const, publishedAt: new Date("2026-09-22T09:00:00Z") },
      reel("2026-09-22T09:00:00Z", 999_999, "tt_play_count"),
    ];
    const result = bestPostingSlots([...tuesdays, ...noise], { timeZone: "UTC" });
    expect(result.slots).toEqual([{ weekday: 1, hour: 9, posts: 3, medianViews: 200 }]);
    expect(result.considered).toBe(3);
  });

  it("eşit medyanda daha çok paylaşımlı dilim, sonra gün ve saat sırası (deterministik)", () => {
    const four = ["2026-09-01T09:00:00Z", "2026-09-08T09:00:00Z", "2026-09-15T09:00:00Z", "2026-09-22T09:00:00Z"].map((iso) => reel(iso, 100));
    const three = ["2026-09-02T10:00:00Z", "2026-09-09T10:00:00Z", "2026-09-16T10:00:00Z"].map((iso) => reel(iso, 100));
    const slots = bestPostingSlots([...three, ...four], { timeZone: "UTC" }).slots;
    expect(slots.map((s) => [s.weekday, s.hour, s.posts])).toEqual([[1, 9, 4], [2, 10, 3]]);
    expect(bestPostingSlots([...four, ...three].reverse(), { timeZone: "UTC" }).slots).toEqual(slots);
  });
});
