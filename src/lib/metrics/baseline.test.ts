import { describe, expect, it } from "vitest";

import { accountBaseline, isYoung } from "@/lib/metrics/baseline";
import type { ScorableItem } from "@/lib/metrics/types";

const NOW = new Date("2026-09-30T12:00:00Z");
const DAY = 86_400_000;

function daysAgo(d: number): Date {
  return new Date(NOW.getTime() - d * DAY);
}

function reel(id: string, age: number, views: number | undefined, extra: Partial<ScorableItem> = {}): ScorableItem {
  return {
    id,
    format: "short_video",
    publishedAt: daysAgo(age),
    views,
    viewsKind: "ig_play_count",
    ...extra,
  };
}

const TARGET = reel("target", 1, 5000);

describe("accountBaseline — kurallar", () => {
  it("negatif ve NaN izlenme noViews sayılır, medyana girmez", () => {
    const all: ScorableItem[] = [
      TARGET,
      reel("neg", 10, -500),
      reel("nan", 10, Number.NaN),
      reel("inf", 10, Number.POSITIVE_INFINITY),
      reel("zero", 10, 0),
      reel("ok", 5, 1000),
    ];
    const b = accountBaseline(all, TARGET, { now: NOW });
    expect(b.excluded.noViews).toBe(3);
    expect(b.basis.map((x) => x.id).sort()).toEqual(["ok", "zero"]);
    expect(b.median).toBe(500);
  });

  it("en yeni 25 içeriğin medyanı; n ≥ 10 → düşük güven değil", () => {
    // 30 uygun içerik: yaş 4..33 gün, views = 100 × yaş. En yeni 25 → yaş 4..28 → medyan yaş 16.
    const all = Array.from({ length: 30 }, (_, i) => reel(`r${i}`, i + 4, (i + 4) * 100));
    const b = accountBaseline(all, TARGET, { now: NOW });
    expect(b.n).toBe(25);
    expect(b.median).toBe(1600);
    expect(b.lowConfidence).toBe(false);
    expect(b.basis[0].id).toBe("r0");
    expect(b.basis[24].id).toBe("r24");
  });

  it("hariç tutulanlar ilk takıldıkları kuralda sayılır", () => {
    const all: ScorableItem[] = [
      TARGET,
      reel("image", 10, 900, { format: "image" }),
      reel("pinned", 10, 90_000, { isPinned: true }),
      reel("pinned-noviews", 10, undefined, { isPinned: true }),
      reel("noviews", 10, undefined),
      reel("otherkind", 10, 700, { viewsKind: "ig_view_count" }),
      reel("unknownkind", 10, 700, { viewsKind: undefined }),
      reel("nodate", 10, 700, { publishedAt: undefined }),
      reel("baddate", 10, 700, { publishedAt: new Date("geçersiz") }),
      reel("young", 2, 50_000),
      reel("future", -1, 50_000),
      reel("ok1", 5, 1000),
      reel("ok2", 6, 3000),
    ];
    const b = accountBaseline(all, TARGET, { now: NOW });
    expect(b.excluded).toEqual({
      self: 1,
      otherFormat: 1,
      pinned: 2,
      noViews: 1,
      otherKind: 2,
      noDate: 2,
      young: 2,
    });
    expect(b.basis.map((x) => x.id)).toEqual(["ok1", "ok2"]);
    expect(b.median).toBe(2000);
    expect(b.n).toBe(2);
    expect(b.lowConfidence).toBe(true);
  });

  it("isPinned undefined = bilinmiyor → dahil", () => {
    const b = accountBaseline([reel("a", 5, 100, { isPinned: undefined })], TARGET, { now: NOW });
    expect(b.n).toBe(1);
    expect(b.excluded.pinned).toBe(0);
  });

  it("views 0 ölçülmüş sıfırdır → baz çizgisine girer", () => {
    const b = accountBaseline([reel("a", 5, 0), reel("b", 6, 0), reel("c", 7, 30)], TARGET, { now: NOW });
    expect(b.n).toBe(3);
    expect(b.median).toBe(0);
  });

  it("n = 0 → medyan undefined + düşük güven", () => {
    const b = accountBaseline([TARGET], TARGET, { now: NOW });
    expect(b.n).toBe(0);
    expect(b.median).toBeUndefined();
    expect(b.lowConfidence).toBe(true);
    expect(b.excluded.self).toBe(1);
  });

  it("hedefin viewsKind'ı bilinmiyorsa hiçbir içerik eşleşmez", () => {
    const target = reel("t", 1, 100, { viewsKind: undefined });
    const b = accountBaseline([reel("a", 5, 100), reel("b", 5, 100, { viewsKind: undefined })], target, { now: NOW });
    expect(b.n).toBe(0);
    expect(b.excluded.otherKind).toBe(2);
  });

  it("n < minN (10) → düşük güven; n = 10 → değil", () => {
    const nine = Array.from({ length: 9 }, (_, i) => reel(`r${i}`, i + 4, 100));
    const ten = Array.from({ length: 10 }, (_, i) => reel(`r${i}`, i + 4, 100));
    expect(accountBaseline(nine, TARGET, { now: NOW }).lowConfidence).toBe(true);
    expect(accountBaseline(ten, TARGET, { now: NOW }).lowConfidence).toBe(false);
  });

  it("seçenekler: window / minAgeDays / minN", () => {
    const all = Array.from({ length: 8 }, (_, i) => reel(`r${i}`, i + 1, (i + 1) * 10));
    const b = accountBaseline(all, TARGET, { now: NOW, window: 3, minAgeDays: 1, minN: 3 });
    expect(b.basis.map((x) => x.id)).toEqual(["r0", "r1", "r2"]);
    expect(b.median).toBe(20);
    expect(b.lowConfidence).toBe(false);
  });

  it("aynı anda yayınlananlar id'ye göre: sonuç girdi sırasından bağımsız", () => {
    const same = [reel("c", 5, 300), reel("a", 5, 100), reel("b", 5, 200)];
    const o = { now: NOW, window: 2 };
    const one = accountBaseline(same, TARGET, o);
    const two = accountBaseline([...same].reverse(), TARGET, o);
    expect(one.basis.map((x) => x.id)).toEqual(["a", "b"]);
    expect(two).toEqual(one);
  });

  it("hedef listede olmasa da çalışır", () => {
    const b = accountBaseline([reel("a", 5, 100)], reel("dışarıda", 1, 10), { now: NOW });
    expect(b.n).toBe(1);
    expect(b.excluded.self).toBe(0);
  });
});

describe("isYoung", () => {
  it("tam 3 gün → genç değil; 3 günden az → genç; gelecek → genç", () => {
    expect(isYoung(daysAgo(3), NOW)).toBe(false);
    expect(isYoung(new Date(daysAgo(3).getTime() + 1), NOW)).toBe(true);
    expect(isYoung(daysAgo(-1), NOW)).toBe(true);
    expect(isYoung(daysAgo(1), NOW, 1)).toBe(false);
  });
});
