import { describe, expect, it } from "vitest";

import { filterDominantViewsKind, medianViewsInDominantKind, type ViewsSample } from "@/lib/metrics/views-summary";

const reel = (views: number | undefined, viewsKind: ViewsSample["viewsKind"] = "ig_play_count"): ViewsSample => ({
  format: "short_video",
  views,
  viewsKind,
});

describe("medianViewsInDominantKind", () => {
  it("yalnız kısa videolar: karusel/görsel izlenmesi karışmaz", () => {
    const items: ViewsSample[] = [
      reel(100),
      reel(300),
      reel(200),
      { format: "carousel", views: 9_000_000, viewsKind: "ig_play_count" },
      { format: "image", views: 9_000_000, viewsKind: "ig_play_count" },
    ];
    expect(medianViewsInDominantKind(items)).toEqual({ median: 200, viewsKind: "ig_play_count", n: 3 });
  });

  it("türler karışmaz: en sık görülen tür seçilir, diğer türün izlenmesi medyana girmez", () => {
    const items = [reel(100), reel(200), reel(300), reel(50_000, "ig_view_count"), reel(60_000, "ig_view_count")];
    expect(medianViewsInDominantKind(items)).toEqual({ median: 200, viewsKind: "ig_play_count", n: 3 });
  });

  it("eşit sayıda türde adı alfabetik önce gelen seçilir (deterministik)", () => {
    const items = [reel(10, "ig_view_count"), reel(20, "ig_view_count"), reel(1000, "ig_play_count"), reel(2000, "ig_play_count")];
    expect(medianViewsInDominantKind(items)).toMatchObject({ viewsKind: "ig_play_count", median: 1500, n: 2 });
    expect(medianViewsInDominantKind([...items].reverse())).toMatchObject({ viewsKind: "ig_play_count" });
  });

  it("izlenmesi ölçülmemiş, türü bilinmeyen ve geçersiz değerler girmez; hiç uygun içerik yoksa undefined (0 değil)", () => {
    expect(medianViewsInDominantKind([reel(undefined), { format: "short_video", views: 100 }, reel(-5), reel(Number.NaN)])).toEqual({ n: 0 });
    expect(medianViewsInDominantKind([])).toEqual({ n: 0 });
    expect(medianViewsInDominantKind([reel(0)])).toEqual({ median: 0, viewsKind: "ig_play_count", n: 1 }); // gerçek 0
  });
});

describe("filterDominantViewsKind", () => {
  it("yalnız uygun (kısa video, ölçülmüş izlenme, bilinen tür) ve en sık türdeki içerikleri girdi sırasıyla döndürür", () => {
    const a = { ...reel(10), id: "a" };
    const b = { ...reel(20, "ig_view_count"), id: "b" };
    const c = { ...reel(30), id: "c" };
    const skipped = [{ ...reel(undefined), id: "x" }, { format: "image" as const, views: 5, viewsKind: "ig_play_count" as const, id: "y" }];
    const result = filterDominantViewsKind([a, b, ...skipped, c]);
    expect(result.viewsKind).toBe("ig_play_count");
    expect(result.items.map((i) => i.id)).toEqual(["a", "c"]);
  });

  it("uygun içerik yoksa tür undefined ve liste boş", () => {
    expect(filterDominantViewsKind([])).toEqual({ items: [] });
    expect(filterDominantViewsKind([reel(undefined)])).toEqual({ items: [] });
  });
});
