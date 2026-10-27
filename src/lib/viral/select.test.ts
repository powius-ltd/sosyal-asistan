import { describe, expect, it } from "vitest";

import type { FoundVideo } from "@/lib/viral/select";
import { applyFollowers, authorKey, authorsNeedingFollowers, dedupeFound, prefilterFound, selectViral } from "@/lib/viral/select";

const NOW = new Date("2026-11-20T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

function video(over: Partial<FoundVideo> = {}): FoundVideo {
  return {
    platform: "instagram",
    externalId: "A1",
    url: "https://www.instagram.com/reel/A1/",
    authorHandle: "yazar",
    views: 50_000,
    viewsKind: "ig_play_count",
    publishedAt: daysAgo(3),
    hashtags: [],
    query: "kahve",
    ...over,
  };
}

describe("dedupeFound", () => {
  it("ilk bulan sorgu kalır, izlenme büyük olan alınır", () => {
    const out = dedupeFound([video({ query: "a", views: 20_000 }), video({ query: "b", views: 40_000 }), video({ externalId: "A2" })]);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ query: "a", views: 40_000 });
  });
  it("aynı kimlik iki platformda ayrı sayılır", () => {
    expect(dedupeFound([video(), video({ platform: "tiktok" })])).toHaveLength(2);
  });
});

describe("prefilterFound / authorsNeedingFollowers", () => {
  it("eski ve düşük izlenmeli elenir", () => {
    const out = prefilterFound([video(), video({ externalId: "B", publishedAt: daysAgo(40) }), video({ externalId: "C", views: 100 })], NOW);
    expect(out.map((v) => v.externalId)).toEqual(["A1"]);
  });
  it("takipçisi bilinmeyen yazarlar tekil, en yüksek izlenme önce; bilinenler listede yok", () => {
    const refs = authorsNeedingFollowers([
      video({ externalId: "1", authorHandle: "a", views: 20_000 }),
      video({ externalId: "2", authorHandle: "b", views: 90_000 }),
      video({ externalId: "3", authorHandle: "a", views: 60_000 }),
      video({ externalId: "4", authorHandle: "c", authorFollowers: 10 }),
    ]);
    expect(refs).toEqual([
      { platform: "instagram", handle: "b", bestViews: 90_000 },
      { platform: "instagram", handle: "a", bestViews: 60_000 },
    ]);
  });
});

describe("applyFollowers / selectViral", () => {
  it("yalnız eksik takipçiyi doldurur, var olanı ezmez", () => {
    const map = new Map([[authorKey("instagram", "yazar"), 1_000]]);
    const [filled, kept] = applyFollowers([video(), video({ externalId: "K", authorFollowers: 7 })], map);
    expect(filled.authorFollowers).toBe(1_000);
    expect(kept.authorFollowers).toBe(7);
  });
  it("takipçisiz video seçilmez; seçilenler orana göre büyükten küçüğe", () => {
    const items = selectViral(
      [
        video({ externalId: "low", authorFollowers: 20_000 }),
        video({ externalId: "mid", authorFollowers: 10_000 }),
        video({ externalId: "top", authorFollowers: 1_000 }),
        video({ externalId: "none" }),
      ],
      NOW,
    );
    expect(items.map((i) => i.externalId)).toEqual(["top", "mid"]);
    expect(items[0].viewsPerFollower).toBe(50);
  });
});
