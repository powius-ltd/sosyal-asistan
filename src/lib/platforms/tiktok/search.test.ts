import { describe, expect, it } from "vitest";

import { buildSearchJob, TIKTOK_SAFE_INPUT } from "@/lib/platforms/tiktok/apify-jobs";
import { tiktokModule } from "@/lib/platforms/tiktok";
import { parseSearch } from "@/lib/platforms/tiktok/normalize-search";
import { loadFixture } from "@/lib/platforms/tiktok/test-support";

describe("tiktok buildSearchJob", () => {
  it("sorguyu searchQueries'e koyar, güvenli sabitleri her zaman ekler", () => {
    const job = buildSearchJob({ query: "  verimlilik ", limit: 15 });
    expect(job.actorId).toBe("clockworks/tiktok-scraper");
    expect(job.kind).toBe("discovery_search");
    expect(job.expectedResults).toBe(15);
    expect(job.input).toMatchObject({ searchQueries: ["verimlilik"], resultsPerPage: 15, ...TIKTOK_SAFE_INPUT });
    expect(job.input.shouldDownloadVideos).toBe(false);
    expect(job.input.commentsPerPost).toBe(0);
    expect(job.input).not.toHaveProperty("videoSearchSorting");
    expect(job.input).not.toHaveProperty("oldestPostDateUnified");
  });
  it("boş sorgu ve geçersiz limit atar", () => {
    expect(() => buildSearchJob({ query: " ", limit: 5 })).toThrow();
    expect(() => buildSearchJob({ query: "a", limit: 0 })).toThrow();
    expect(() => buildSearchJob({ query: "a", limit: 1000 })).toThrow();
  });
  it("modüle bağlıdır", () => {
    expect(tiktokModule.publicData.buildSearchJob).toBe(buildSearchJob);
    expect(tiktokModule.publicData.parseSearch).toBe(parseSearch);
  });
});

describe("tiktok parseSearch", () => {
  const result = parseSearch(loadFixture("search-users"));

  it("yazar başına tek aday, source search", () => {
    expect(result.items.map((c) => c.handle)).toEqual(["ornek.bir", "ornek.iki", "ornek.uc"]);
    expect(result.items.every((c) => c.platform === "tiktok" && c.source === "search")).toBe(true);
    expect(result.items[0]?.followers).toBe(52000);
    expect(result.notItems.length).toBe(2); // tekrar + gizli
  });
  it("takipçi bilinmiyorsa followers alanı yok (0 değil)", () => {
    const two = result.items.find((c) => c.handle === "ornek.iki");
    expect(two).toBeDefined();
    expect("followers" in (two ?? {})).toBe(false);
  });
  it("gizlilik: üçüncü kişi ve künye alanları çıktıda yok", () => {
    const out = JSON.stringify(result);
    for (const v of ["yorumcu.arama_9", "gizli arama yorumu 4d2b", "anilan.arama", "muzik.arama_sahibi", "ortak.arama_kisi", "Gizli Ad Uc", "avatar-gizli-uc", "6910000000000000005"]) {
      expect(out).not.toContain(v);
    }
    expect(Object.keys(result.items[2] ?? {}).sort()).toEqual(["followers", "handle", "platform", "source"]);
  });
});
