/**
 * Apify iş tanımları (aktör + girdi). Yalnız herkese açık, oturumsuz veri:
 * girdilerde oturum/kimlik doğrulama alanı YOKTUR (test zorlar).
 *
 * Girdi alanları aktörlerin girdi şemasından doğrulanmıştır (2026-09-30):
 *  - `apify/instagram-reel-scraper`   : `username[]`, `resultsLimit`, `onlyPostsNewerThan`, `includeTranscript`,
 *                                        `includeSharesCount`, `includeDownloadedVideo`, `skipPinnedPosts`, `skipTrialReels`
 *  - `apify/instagram-profile-scraper`: `usernames[]`, `includeAboutSection`
 *  - `apify/instagram-search-scraper` : `search`, `searchType` (place|user|hashtag|popular), `searchLimit` (≤250)
 * Ücretli ek özellikler (transcript, paylaşım sayısı, video indirme, hakkında bölümü) AÇIKÇA `false` verilir:
 * aktörün varsayılanı değişse bile beklenmedik harcama olmaz.
 */
import type { ScrapeJobSpec } from "@/lib/platforms/types";
import { normalizeHandle } from "@/lib/platforms/instagram/handle";

export const INSTAGRAM_ACTORS = {
  profile: "apify/instagram-profile-scraper",
  content: "apify/instagram-reel-scraper",
  search: "apify/instagram-search-scraper",
} as const;

/** `searchLimit` üst sınırı (aktör şeması). */
export const SEARCH_LIMIT_MAX = 250;

function requireHandle(raw: string): string {
  const handle = normalizeHandle(raw);
  if (handle === "") throw new Error(`Geçersiz Instagram kullanıcı adı: "${String(raw).slice(0, 60)}"`);
  return handle;
}

function requirePositiveInt(name: string, value: number, max?: number): number {
  if (!Number.isInteger(value) || value < 1 || (max !== undefined && value > max)) {
    throw new RangeError(`${name} 1${max !== undefined ? `–${max}` : "+"} arasında tam sayı olmalı (verilen: ${String(value)}).`);
  }
  return value;
}

/** `2026-08-01T00:00:00Z` → `2026-08-01` (aktör tarih ya da "1 month" gibi göreli değer bekler); göreli metin olduğu gibi. */
function newerThanValue(raw: string): string {
  const value = raw.trim();
  if (value === "") throw new Error("newerThan boş olamaz.");
  const isoDate = /^(\d{4}-\d{2}-\d{2})T/.exec(value);
  return isoDate ? isoDate[1] : value;
}

export function buildProfileJob(handles: string[]): ScrapeJobSpec {
  const usernames = [...new Set(handles.map(requireHandle))];
  if (usernames.length === 0) throw new Error("En az bir kullanıcı adı gerekir.");
  return {
    kind: "profile",
    actorId: INSTAGRAM_ACTORS.profile,
    input: { usernames, includeAboutSection: false },
    expectedResults: usernames.length,
  };
}

export function buildContentJob(o: { handle: string; limit: number; newerThan?: string; includeTranscript: boolean }): ScrapeJobSpec {
  const limit = requirePositiveInt("limit", o.limit);
  const input: Record<string, unknown> = {
    username: [requireHandle(o.handle)],
    resultsLimit: limit,
    includeTranscript: o.includeTranscript === true,
    includeSharesCount: false,
    includeDownloadedVideo: false,
  };
  if (o.newerThan !== undefined) input.onlyPostsNewerThan = newerThanValue(o.newerThan);
  return { kind: "content", actorId: INSTAGRAM_ACTORS.content, input, expectedResults: limit };
}

export function buildSearchJob(o: { query: string; limit: number }): ScrapeJobSpec {
  const query = o.query.trim();
  if (query === "") throw new Error("Arama sorgusu boş olamaz.");
  const limit = requirePositiveInt("limit", o.limit, SEARCH_LIMIT_MAX);
  return {
    kind: "discovery_search",
    actorId: INSTAGRAM_ACTORS.search,
    // `user`: hesap araması (yer/etiket değil). Facebook sayfası/e-posta zenginleştirmesi İSTENMEZ.
    input: { search: query, searchType: "user", searchLimit: limit },
    expectedResults: limit,
  };
}
