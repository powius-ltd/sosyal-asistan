import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { TIKTOK_ACTORS, TIKTOK_SAFE_INPUT } from "@/lib/platforms/tiktok/apify-jobs";
import { tiktokModule } from "@/lib/platforms/tiktok";
import { buildViralJob, hashtagOf, parseViral } from "@/lib/platforms/tiktok/viral-jobs";

function fixture(): Record<string, unknown>[] {
  return JSON.parse(readFileSync(fileURLToPath(new URL("../../../../fixtures/apify/tiktok/viral-hashtag.json", import.meta.url)), "utf8")) as Record<string, unknown>[];
}

describe("TikTok viral iş tanımı", () => {
  it("yalnız hashtags (searchQueries yok), etiket başına sınır, ücretli ekler ve depoya yazma kapalı", () => {
    const job = buildViralJob({ query: "#Kahve Demleme", limit: 50 });
    expect(job.actorId).toBe(TIKTOK_ACTORS.scraper);
    expect(job.input).toMatchObject({ hashtags: ["KahveDemleme"], resultsPerPage: 50, ...TIKTOK_SAFE_INPUT });
    expect(job.input).not.toHaveProperty("searchQueries");
    // Ücretli süzgeçler ve ekler gönderilmez / kapalıdır.
    for (const key of ["oldestPostDateUnified", "newestPostDate", "leastDiggs", "mostDiggs", "videoSearchSorting", "videoSearchDateFilter"]) expect(job.input).not.toHaveProperty(key);
    expect(job.input).toMatchObject({ shouldDownloadVideos: false, shouldDownloadCovers: false, downloadSubtitlesOptions: "NEVER_DOWNLOAD_SUBTITLES", commentsPerPost: 0, aiVideoDescription: false });
    expect(JSON.stringify(job.input).toLowerCase()).not.toMatch(new RegExp(["ses"+"sion", "coo"+"kie", "password", "login"].join("|")));
  });

  it("boş sorgu ve geçersiz sınır reddedilir; etiket boşluksuz", () => {
    expect(() => buildViralJob({ query: "#", limit: 5 })).toThrow();
    expect(() => buildViralJob({ query: "kahve", limit: 1.5 })).toThrow(RangeError);
    expect(hashtagOf("  kahve  demleme ")).toBe("kahvedemleme");
  });

  it("modül viral ucunu taşır; takipçi aynı sonuçta gelir", () => {
    expect(tiktokModule.publicData.viral?.followersInResult).toBe(true);
  });
});

describe("TikTok viral ayrıştırma", () => {
  const result = parseViral(fixture());

  it("slayt, hata satırı elenir; geri kalan öğe", () => {
    expect(result.items.map((v) => v.authorHandle)).toEqual(["kucuk_yazar_1", "buyuk_hesap", "takipcisi_yok", "kucuk_yazar_5", "temiz_yazar"]);
    expect(result.notItems).toHaveLength(2);
    expect(result.notItems.some((n) => n.reason.includes("slayt"))).toBe(true);
  });

  it("sayılar, takipçi ve tür", () => {
    expect(result.items[0]).toMatchObject({ platform: "tiktok", views: 90000, viewsKind: "tt_play_count", authorFollowers: 2000, likes: 6100, comments: 140, shares: 210, durationSec: 24, hashtags: ["kahve", "demleme"] });
    expect(result.items[0].url).toBe("https://www.tiktok.com/@kucuk_yazar_1/video/7300000000000000001");
  });

  it("takipçi sonuçta yoksa alan hiç yazılmaz (0 değil)", () => {
    const missing = result.items.find((v) => v.authorHandle === "takipcisi_yok");
    expect(missing).not.toHaveProperty("authorFollowers");
  });
});
