/**
 * Instagram viral av: konuyla patlamış Reels (aktör `apify/instagram-hashtag-scraper`, oturumsuz).
 *
 * Girdi / çıktı şeması aktörün herkese açık yapı kaydından doğrulandı (Apify API `acts/apify~instagram-hashtag-scraper/builds/default`,
 * yapı 0.0.701, 2026-10-20; koşu YOK): girdi `hashtags[]` (zorunlu), `keywordSearch` (çok sözcüklü konu için), `resultsType`
 * (`posts | reels | stories`), `resultsLimit` (≥ 1; SORGU BAŞINA). Tarih / izlenme süzgeci yok → yaş eşiği çağıran tarafta uygulanır.
 * Çıktı (readme örnekleri): `shortCode`, `url`, `caption`, `hashtags`, `likesCount` (-1 = gizli), `commentsCount`, `videoPlayCount` /
 * `igPlayCount` / `videoViewCount`, `sharesCount`, `timestamp`, `videoDuration`, `ownerUsername`. Yazarın takipçisi sonuçta YOK → eşik adayı
 * yazarlar için `apify/instagram-profile-scraper` (`PublicDataAdapter.buildProfileJob`).
 * Sonuç başı fiyat $0,0026 (en yüksek kademe; fiyat kaydı 2026-10-20).
 *
 * Uyum: çıktı yalnız aşağıda adı geçen alanlardan kurulur, ham nesne yayılmaz. HİÇ okunmayanlar: `latestComments`, `firstComment`, `taggedUsers`,
 * `mentions`, `coauthorProducers`, `ownerFullName`, `ownerId`, `locationName`, `musicInfo`, `videoUrl`, `displayUrl` ve diğer tüm medya adresleri.
 * `ownerUsername` yalnız herkese açık kullanıcı adıdır. Testli (`viral-privacy.test.ts`).
 */
import { pickBool, pickCount, pickDate, pickId, pickNumber, pickString, pickStringArray, type RawItem } from "@/lib/platforms/_shared/field-pick";
import { notItemReason } from "@/lib/platforms/_shared/not-item";
import { cleanHashtags, clipCaption } from "@/lib/platforms/_shared/viral-fields";
import { contentUrl } from "@/lib/platforms/instagram/content-url";
import { normalizeHandle } from "@/lib/platforms/instagram/handle";
import type { ParseResult, ScrapeJobSpec } from "@/lib/platforms/types";
import type { ViralAdapter, ViralVideo } from "@/lib/platforms/viral-types";

export const INSTAGRAM_VIRAL_ACTOR = "apify/instagram-hashtag-scraper";

const HASHTAG_IN_TEXT = /#([\p{L}\p{N}_]+)/gu;

export function buildViralJob(o: { query: string; limit: number }): ScrapeJobSpec {
  const query = o.query.trim().replace(/^#+/, "");
  if (query === "") throw new Error("Viral av sorgusu boş olamaz.");
  if (!Number.isInteger(o.limit) || o.limit < 1) throw new RangeError(`limit 1+ tam sayı olmalı (verilen: ${String(o.limit)}).`);
  return {
    kind: "discovery_search",
    actorId: INSTAGRAM_VIRAL_ACTOR,
    // Konu çok sözcüklü olabilir → anahtar sözcük araması (etiket aramasında sözcükler birleşir). Yalnız Reels.
    input: { hashtags: [query], keywordSearch: true, resultsType: "reels", resultsLimit: o.limit },
    expectedResults: o.limit,
  };
}

function normalizeRow(row: RawItem): { ok: true; value: ViralVideo } | { ok: false; reason: string } {
  const shortcode = pickString(row, ["shortCode", "shortcode", "code"]);
  const externalId = shortcode ?? pickId(row, ["id", "pk"]);
  if (!externalId) return { ok: false, reason: "içerik kimliği yok (shortCode/id)" };

  const authorHandle = normalizeHandle(pickString(row, ["ownerUsername"]) ?? "");
  if (authorHandle === "") return { ok: false, reason: `yazar kullanıcı adı yok (${externalId})` };

  // İzlenme: oynatma sayısı önce (Instagram'ın gösterdiği "izlenme"); yoksa görüntüleme. Hiçbiri yoksa ölçülemedi → satır elenir.
  const play = pickCount(row, ["videoPlayCount", "igPlayCount"]);
  const view = pickCount(row, ["videoViewCount"]);
  const views = play ?? view;
  if (views === undefined) return { ok: false, reason: `izlenme sayısı yok (${externalId})` };

  const publishedAt = pickDate(row, ["timestamp", "takenAt"]);
  if (!publishedAt) return { ok: false, reason: `yayın tarihi yok (${externalId})` };

  const given = pickString(row, ["url"]);
  const url = given && /^https:\/\/(www\.)?instagram\.com\//i.test(given) ? given : shortcode ? contentUrl({ externalId, shortcode }) : undefined;
  if (!url) return { ok: false, reason: `içerik bağlantısı kurulamadı (${externalId})` };

  const caption = pickString(row, ["caption"]);
  const listed = pickStringArray(row, ["hashtags"]) ?? [...(caption ?? "").matchAll(HASHTAG_IN_TEXT)].map((m) => m[1]);
  const likes = pickNumber(row, ["likesCount"]);
  const commentsOff = pickBool(row, ["isCommentsDisabled", "commentsDisabled"]) === true;
  const comments = commentsOff ? undefined : pickCount(row, ["commentsCount"]);
  const shares = pickCount(row, ["sharesCount"]);
  const duration = pickNumber(row, ["videoDuration", "duration"]);

  const video: ViralVideo = {
    platform: "instagram",
    externalId,
    url,
    authorHandle,
    views,
    viewsKind: play !== undefined ? "ig_play_count" : "ig_view_count",
    publishedAt,
    hashtags: cleanHashtags(listed),
  };
  if (likes !== undefined && likes >= 0) video.likes = likes; // -1 = gizli beğeni → ölçülemedi
  if (comments !== undefined) video.comments = comments;
  if (shares !== undefined) video.shares = shares;
  if (duration !== undefined && duration > 0) video.durationSec = Math.round(duration * 100) / 100;
  const clipped = clipCaption(caption);
  if (clipped !== undefined) video.caption = clipped;
  return { ok: true, value: video };
}

export function parseViral(raw: unknown[]): ParseResult<ViralVideo> {
  const items: ViralVideo[] = [];
  const notItems: { reason: string }[] = [];
  const seen = new Set<string>();
  for (const row of raw) {
    const reason = notItemReason(row);
    if (reason) {
      notItems.push({ reason });
      continue;
    }
    const result = normalizeRow(row as RawItem);
    if (!result.ok) notItems.push({ reason: result.reason });
    else if (seen.has(result.value.externalId)) notItems.push({ reason: `aynı içerik tekrar (${result.value.externalId})` });
    else {
      seen.add(result.value.externalId);
      items.push(result.value);
    }
  }
  return { items, notItems };
}

export const instagramViral: ViralAdapter = { buildJob: buildViralJob, parse: parseViral, followersInResult: false };
