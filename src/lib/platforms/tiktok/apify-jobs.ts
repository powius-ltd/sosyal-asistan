/**
 * Apify iş tanımları (aktör + girdi) — TikTok. Yalnız herkese açık, oturumsuz veri: girdilerde oturum/kimlik doğrulama alanı YOKTUR (test zorlar).
 *
 * Aktör: `clockworks/tiktok-scraper`. Girdi şeması aktörün herkese açık yapı kaydından doğrulandı (Apify API `acts/clockworks~tiktok-scraper/builds/default`,
 * yapı 0.0.616, 2026-10-13): `profiles[]`, `resultsPerPage` (≥ 1, varsayılan 1), `profileScrapeSections` (varsayılan `["videos"]`),
 * `profileSorting` (`latest | popular | oldest`), `excludePinnedPosts`, `shouldDownload{Videos,Covers,SlideshowImages,Avatars,MusicCovers}`,
 * `downloadSubtitlesOptions` (`NEVER_DOWNLOAD_SUBTITLES | …`), `commentsPerPost`, `maxFollowersPerProfile`, `maxFollowingPerProfile`, `proxyCountryCode`.
 *
 * TikTok'ta ayrı profil aktörü yoktur: profil künyesi her video satırının `authorMeta` alanındadır. Profil işi hesap başına TEK video ister
 * (sonuç başı ücret; hesap başına 1 sonuç).
 *
 * ŞASİ — rakip videosu saklanmaz: videoyu / kapağı / avatarı Apify deposuna yazan seçeneklerin HEPSİ açıkça `false` gönderilir (aktörün
 * varsayılanı değişse bile). Ücretli ekler de açıkça kapalıdır: altyazı / yazıya dökme (dakika başı ücret), yorum, takipçi listesi, ülke vekili.
 * Tarih süzgeci (`oldestPostDateUnified`) ÜCRETLİ ek olduğundan GÖNDERİLMEZ: rezerve edilen tutar yalnız sonuç başı ücreti kapsar; `newerThan`
 * istenirse en yeni `limit` video alınır (sıralama `latest`), eskiler çağıran tarafta zaten bilinen içerik olarak güncellenir.
 */
import type { ScrapeJobSpec } from "@/lib/platforms/types";
import { normalizeHandle } from "@/lib/platforms/tiktok/handle";

export const TIKTOK_ACTORS = {
  /** Profil ve içerik aynı aktörden gelir. */
  scraper: "clockworks/tiktok-scraper",
} as const;

/**
 * Her işe eklenen sabit kapalı seçenekler: depoya yazma (video, kapak, slayt görseli, avatar, müzik kapağı) ve ücretli ekler.
 * Değerler aktör şemasındaki "kapalı" değerlerdir.
 */
export const TIKTOK_SAFE_INPUT = {
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
  scrapeRelatedSearchWords: false,
  scrapeAdditionalAuthorMeta: false,
  proxyCountryCode: "None",
} as const;

function requireHandle(raw: string): string {
  const handle = normalizeHandle(raw);
  if (handle === "") throw new Error(`Geçersiz TikTok kullanıcı adı: "${String(raw).slice(0, 60)}"`);
  return handle;
}

function requirePositiveInt(name: string, value: number): number {
  if (!Number.isInteger(value) || value < 1) throw new RangeError(`${name} 1+ tam sayı olmalı (verilen: ${String(value)}).`);
  return value;
}

function profileInput(profiles: string[], resultsPerPage: number): Record<string, unknown> {
  return { profiles, resultsPerPage, profileScrapeSections: ["videos"], profileSorting: "latest", excludePinnedPosts: false, ...TIKTOK_SAFE_INPUT };
}

/** Profil künyesi: hesap başına tek video satırı (künye `authorMeta`'da). */
export function buildProfileJob(handles: string[]): ScrapeJobSpec {
  const profiles = [...new Set(handles.map(requireHandle))];
  if (profiles.length === 0) throw new Error("En az bir kullanıcı adı gerekir.");
  return { kind: "profile", actorId: TIKTOK_ACTORS.scraper, input: profileInput(profiles, 1), expectedResults: profiles.length };
}

/** Hesabın en yeni `limit` videosu. `newerThan` ve `includeTranscript` bilerek KULLANILMAZ (ikisi de ücretli ek; yukarıdaki not). */
export function buildContentJob(o: { handle: string; limit: number; newerThan?: string; includeTranscript: boolean }): ScrapeJobSpec {
  const limit = requirePositiveInt("limit", o.limit);
  return { kind: "content", actorId: TIKTOK_ACTORS.scraper, input: profileInput([requireHandle(o.handle)], limit), expectedResults: limit };
}

const SEARCH_LIMIT_MAX = 100;

/**
 * Hesap araması. `searchSection: "/user"` hesap sonuçları içindir. [NETLEŞMEDİ] Değer aktörün herkese açık şemasında doğrulanmadı
 * (keşif notu yalnız `searchQueries` + `searchSection` alanlarının varlığını söylüyor); ilk onaylı gerçek koşuda doğrulanmalı.
 * Ücretli ekler (`videoSearchSorting`, `videoSearchDateFilter`) GÖNDERİLMEZ; `TIKTOK_SAFE_INPUT` her zaman eklenir.
 */
export function buildSearchJob(o: { query: string; limit: number }): ScrapeJobSpec {
  const query = o.query.trim();
  if (query === "") throw new Error("Arama sorgusu boş olamaz.");
  const limit = requirePositiveInt("limit", o.limit);
  if (limit > SEARCH_LIMIT_MAX) throw new RangeError(`limit en çok ${SEARCH_LIMIT_MAX} olabilir (verilen: ${limit}).`);
  return {
    kind: "discovery_search",
    actorId: TIKTOK_ACTORS.scraper,
    input: { searchQueries: [query], searchSection: "/user", resultsPerPage: limit, ...TIKTOK_SAFE_INPUT },
    expectedResults: limit,
  };
}
