import { describe, expect, it } from "vitest";

import { mapZernioPost, shortcodeToMediaId, toSnapshotPoint } from "@/lib/zernio/map";
import { zernioPostSchema } from "@/lib/zernio/schema";

const basePost = {
  content: "Claude ile otomasyon #ai #Otomasyon #ai",
  publishedAt: "2026-10-17T17:31:05.000Z",
  status: "published",
  platform: "instagram",
  platformPostUrl: "https://www.instagram.com/reel/DZ263dUNsyC/",
  mediaProductType: "REELS",
  analytics: { views: 9240, reach: 7475, likes: 33, comments: 4, shares: 9, saves: 134, igReelsAvgWatchTime: 8176, videoDurationSeconds: 42, impressions: 9500, profileViews: 12 },
  // Kişisel / kitle verisi şema tarafından atılmalı:
  audienceCountries: { TR: 100 },
  platforms: [{ accountId: "acc1", accountUsername: "kisi" }],
};
const parse = (extra: Record<string, unknown> = {}) => zernioPostSchema.parse({ ...basePost, ...extra });

describe("shortcodeToMediaId", () => {
  it("Apify'ın medya kimliğiyle aynı sonucu verir", () => {
    expect(shortcodeToMediaId("DZ263dUNsyC")).toBe("3924583023046478978");
    expect(shortcodeToMediaId("DbRDbObAwQ1")).toBe("3949953413231608885");
  });
  it("geçersiz karakter ya da boş girdide undefined", () => {
    expect(shortcodeToMediaId("AB$")).toBeUndefined();
    expect(shortcodeToMediaId("")).toBeUndefined();
  });
});

describe("mapZernioPost", () => {
  it("Reels'i içerik alanlarına ve ölçüme çevirir", () => {
    const result = mapZernioPost(parse());
    if (!("mapped" in result)) throw new Error("eşlenmedi");
    const { content, metrics } = result.mapped;
    expect(content).toMatchObject({ externalId: "3924583023046478978", shortcode: "DZ263dUNsyC", url: "https://www.instagram.com/reel/DZ263dUNsyC/", durationSec: 42, publishedAt: "2026-10-17T17:31:05.000Z" });
    expect(content.hashtags).toEqual(["ai", "otomasyon"]);
    expect(content.missingFields).toEqual([]);
    expect(metrics).toMatchObject({ views: 9240, likes: 33, comments: 4, shares: 9, saves: 134, reach: 7475 });
    expect(metrics.avgWatchSec).toBeCloseTo(8.176);
    expect(metrics.extra).toEqual({ impressions: 9500, profile_views: 12 });
  });

  it("şema kitle / kişi alanlarını atar", () => {
    expect(JSON.stringify(parse())).not.toContain("audienceCountries");
    expect(JSON.stringify(parse())).not.toContain("accountUsername");
  });

  it("eksik alan 0 olmaz: undefined kalır ve missingFields'a girer", () => {
    const result = mapZernioPost(parse({ analytics: { views: 10, likes: null, saves: 0 } }));
    if (!("mapped" in result)) throw new Error("eşlenmedi");
    expect(result.mapped.metrics.views).toBe(10);
    expect(result.mapped.metrics.saves).toBe(0);
    expect(result.mapped.metrics.likes).toBeUndefined();
    expect(result.mapped.metrics.avgWatchSec).toBeUndefined();
    expect(result.mapped.content.missingFields).toEqual(expect.arrayContaining(["likes", "comments", "reach", "avg_watch_sec"]));
    expect(result.mapped.content.missingFields).not.toContain("saves");
  });

  it("views yoksa impressions views yerine kullanılmaz", () => {
    const result = mapZernioPost(parse({ analytics: { impressions: 500 } }));
    if (!("mapped" in result)) throw new Error("eşlenmedi");
    expect(result.mapped.metrics.views).toBeUndefined();
    expect(result.mapped.metrics.extra.impressions).toBe(500);
  });

  it("Reels olmayan, yayınlanmamış ya da Instagram dışı gönderiyi atlar", () => {
    expect(mapZernioPost(parse({ mediaProductType: "FEED" }))).toEqual({ skipped: "not_reel" });
    expect(mapZernioPost(parse({ status: "scheduled" }))).toEqual({ skipped: "not_published" });
    expect(mapZernioPost(parse({ platform: "tiktok" }))).toEqual({ skipped: "not_instagram" });
    expect(mapZernioPost(parse({ platformPostUrl: undefined }))).toEqual({ skipped: "no_url" });
  });

  it("bozuk tipli alan gönderiyi düşürmez, yalnız o alan düşer", () => {
    const result = mapZernioPost(parse({ analytics: { views: "çok", likes: 3 } }));
    if (!("mapped" in result)) throw new Error("eşlenmedi");
    expect(result.mapped.metrics.views).toBeUndefined();
    expect(result.mapped.metrics.likes).toBe(3);
  });
});

describe("toSnapshotPoint", () => {
  it("izlenme varsa ig_views türüyle, yoksa türsüz nokta üretir", () => {
    expect(toSnapshotPoint({ views: 5, extra: {} }, "2026-10-20T06:00:00.000Z", 46)).toEqual({ capturedAt: "2026-10-20T06:00:00.000Z", views: 5, viewsKind: "ig_views", ownerFollowers: 46 });
    expect(toSnapshotPoint({ extra: {} }, "2026-10-20T06:00:00.000Z").viewsKind).toBeUndefined();
  });
});
