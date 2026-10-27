import { describe, expect, it } from "vitest";

import { buildContentJob, buildProfileJob, TIKTOK_ACTORS, TIKTOK_SAFE_INPUT } from "@/lib/platforms/tiktok/apify-jobs";

/** Depoya yazan (rakip videosu saklanmaz) ya da ek ücret doğuran seçenekler: hepsi "kapalı" değerinde gönderilmeli. */
const MUST_BE_OFF: Record<string, unknown> = {
  shouldDownloadVideos: false,
  shouldDownloadCovers: false,
  shouldDownloadSlideshowImages: false,
  shouldDownloadAvatars: false,
  shouldDownloadMusicCovers: false,
  downloadSubtitlesOptions: "NEVER_DOWNLOAD_SUBTITLES",
  aiVideoDescription: false,
  aiVideoSummary: false,
  commentsPerPost: 0,
  topLevelCommentsPerPost: 0,
  maxRepliesPerComment: 0,
  maxFollowersPerProfile: 0,
  maxFollowingPerProfile: 0,
  scrapeRelatedVideos: false,
  proxyCountryCode: "None",
};

function expectSafe(input: Record<string, unknown>): void {
  for (const [key, off] of Object.entries(MUST_BE_OFF)) expect(input[key], key).toBe(off);
  // Depo adı verilmez (kalıcı adlandırılmış depoya hiçbir şey yazılmaz); ücretli tarih / beğeni süzgeci ve arama gönderilmez.
  for (const key of ["videoKvStoreIdOrName", "oldestPostDateUnified", "newestPostDate", "mostDiggs", "leastDiggs", "searchQueries", "postURLs", "hashtags"]) {
    expect(input, key).not.toHaveProperty(key);
  }
  // Oturum / kimlik doğrulama alanı yok.
  expect(JSON.stringify(input)).not.toMatch(/token|password|login|credential/i);
}

describe("TikTok Apify iş tanımları", () => {
  it("profil işi: hesap başına TEK video, tekilleştirilmiş kullanıcı adları", () => {
    const job = buildProfileJob(["@Ornek.Hesap", "ornek.hesap", "https://www.tiktok.com/@baska_hesap"]);
    expect(job.kind).toBe("profile");
    expect(job.actorId).toBe(TIKTOK_ACTORS.scraper);
    expect(job.input.profiles).toEqual(["ornek.hesap", "baska_hesap"]);
    expect(job.input.resultsPerPage).toBe(1);
    expect(job.expectedResults).toBe(2);
    expectSafe(job.input);
  });

  it("içerik işi: en yeni `limit` video; rezerve tabanı = limit", () => {
    const job = buildContentJob({ handle: "ornek.hesap", limit: 25, includeTranscript: false });
    expect(job.kind).toBe("content");
    expect(job.actorId).toBe("clockworks/tiktok-scraper");
    expect(job.input).toMatchObject({ profiles: ["ornek.hesap"], resultsPerPage: 25, profileScrapeSections: ["videos"], profileSorting: "latest", excludePinnedPosts: false });
    expect(job.expectedResults).toBe(25);
    expectSafe(job.input);
  });

  it("video indirme / depoya yazma HİÇBİR koşulda açılmaz (rakip videosu saklanmaz)", () => {
    for (const includeTranscript of [true, false]) {
      const { input } = buildContentJob({ handle: "ornek.hesap", limit: 3, newerThan: "2026-09-01T00:00:00Z", includeTranscript });
      expectSafe(input);
      expect(input.shouldDownloadVideos).toBe(false);
    }
    expect(TIKTOK_SAFE_INPUT.shouldDownloadVideos).toBe(false);
  });

  it("geçersiz kullanıcı adı ve limit reddedilir", () => {
    expect(() => buildProfileJob([])).toThrow(/En az bir/);
    expect(() => buildProfileJob(["kahve-yeri"])).toThrow(/Geçersiz TikTok/);
    expect(() => buildContentJob({ handle: "a", limit: 5, includeTranscript: false })).toThrow(/Geçersiz TikTok/);
    expect(() => buildContentJob({ handle: "ornek.hesap", limit: 0, includeTranscript: false })).toThrow(RangeError);
    expect(() => buildContentJob({ handle: "ornek.hesap", limit: 2.5, includeTranscript: false })).toThrow(RangeError);
  });
});
