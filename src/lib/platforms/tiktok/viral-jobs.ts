/**
 * TikTok viral av: konuyla patlamış videolar (aktör `clockworks/tiktok-scraper`, oturumsuz).
 *
 * Girdi / çıktı şeması aktörün herkese açık yapı kaydından doğrulandı (yapı 0.0.620, 2026-10-20; koşu YOK): girdi `hashtags[]`
 * ("bu etiketli videolar"), `resultsPerPage` (etiket / sorgu BAŞINA sonuç sayısı), `searchQueries[]` + `searchSection`
 * (`"" | "/video" | "/user"`; sorgu hem video hem hesap döndürebilir → KULLANILMAZ, karar (c): yalnız `hashtags`). Çıktı (`posts` /
 * `author` görünümleri): `id`, `text`, `createTimeISO`, `webVideoUrl`, `playCount`, `diggCount`, `commentCount`, `shareCount`,
 * `videoMeta.duration`, `hashtags[].name`, `authorMeta.name` (kullanıcı adı), `authorMeta.fans` (yazar takipçisi: AYNI sonuçta).
 * Sonuç başı fiyat $0,0037 (en yüksek kademe; fiyat kaydı 2026-10-20). Tarih / beğeni süzgeci ÜCRETLİ ek olduğundan gönderilmez
 * (`TIKTOK_SAFE_INPUT` her zaman eklenir); yaş eşiği çağıran tarafta uygulanır.
 *
 * Uyum: yalnız adı geçen alanlar okunur. HİÇ okunmayanlar: yorumlar, `mentions`, `detailedMentions`, `musicMeta`, `locationMeta`,
 * `authorMeta.nickName` / `id` / `avatar` / `signature`, medya adresleri. `authorMeta.name` yalnız herkese açık kullanıcı adıdır;
 * `authorMeta.fans` bir sayıdır. Testli (`viral-privacy.test.ts`).
 */
import { asRecord, pickBool, pickCount, pickDate, pickNumber, pickString, type RawItem } from "@/lib/platforms/_shared/field-pick";
import { notItemReason } from "@/lib/platforms/_shared/not-item";
import { cleanHashtags, clipCaption } from "@/lib/platforms/_shared/viral-fields";
import { TIKTOK_ACTORS, TIKTOK_SAFE_INPUT } from "@/lib/platforms/tiktok/apify-jobs";
import { TIKTOK_VIDEO_ID_PATTERN } from "@/lib/platforms/tiktok/content-url";
import { normalizeHandle } from "@/lib/platforms/tiktok/handle";
import type { ParseResult, ScrapeJobSpec } from "@/lib/platforms/types";
import type { ViralAdapter, ViralVideo } from "@/lib/platforms/viral-types";

const HASHTAG_IN_TEXT = /#([\p{L}\p{N}_]+)/gu;

/** TikTok etiketi tek sözcüktür (boşluk, `#` yok): çok sözcüklü konu birleştirilir ("kahve demleme" → "kahvedemleme"). */
export function hashtagOf(query: string): string {
  return query.trim().replace(/^#+/, "").replace(/\s+/g, "");
}

export function buildViralJob(o: { query: string; limit: number }): ScrapeJobSpec {
  const tag = hashtagOf(o.query);
  if (tag === "") throw new Error("Viral av sorgusu boş olamaz.");
  if (!Number.isInteger(o.limit) || o.limit < 1) throw new RangeError(`limit 1+ tam sayı olmalı (verilen: ${String(o.limit)}).`);
  return {
    kind: "discovery_search",
    actorId: TIKTOK_ACTORS.scraper,
    input: { hashtags: [tag], resultsPerPage: o.limit, ...TIKTOK_SAFE_INPUT },
    expectedResults: o.limit,
  };
}

function hashtagsOf(row: RawItem, caption: string | undefined): string[] {
  const raw = row.hashtags;
  const named = Array.isArray(raw)
    ? raw.map((entry) => (typeof entry === "string" ? entry : pickString(asRecord(entry) ?? {}, ["name"]))).filter((name): name is string => name !== undefined)
    : [];
  return cleanHashtags(named.length > 0 ? named : [...(caption ?? "").matchAll(HASHTAG_IN_TEXT)].map((m) => m[1]));
}

function normalizeRow(row: RawItem): { ok: true; value: ViralVideo } | { ok: false; reason: string } {
  const externalId = pickString(row, ["id"]) ?? (typeof row.id === "number" && Number.isSafeInteger(row.id) ? String(row.id) : undefined);
  if (!externalId || !TIKTOK_VIDEO_ID_PATTERN.test(externalId)) return { ok: false, reason: "video kimliği yok ya da geçersiz" };

  const authorHandle = normalizeHandle(pickString(row, ["authorMeta.name"]) ?? "");
  if (authorHandle === "") return { ok: false, reason: `yazar kullanıcı adı yok (${externalId})` };

  const views = pickCount(row, ["playCount"]);
  if (views === undefined) return { ok: false, reason: `izlenme sayısı yok (${externalId})` };

  const publishedAt = pickDate(row, ["createTimeISO", "createTime"]);
  if (!publishedAt) return { ok: false, reason: `yayın tarihi yok (${externalId})` };

  const given = pickString(row, ["webVideoUrl"]);
  const url = given && /^https:\/\/(www\.)?tiktok\.com\//i.test(given) ? given : `https://www.tiktok.com/@${authorHandle}/video/${externalId}`;
  const caption = pickString(row, ["text"]);

  const video: ViralVideo = {
    platform: "tiktok",
    externalId,
    url,
    authorHandle,
    views,
    viewsKind: "tt_play_count",
    publishedAt,
    hashtags: hashtagsOf(row, caption),
  };
  const followers = pickCount(row, ["authorMeta.fans"]);
  if (followers !== undefined) video.authorFollowers = followers;
  const likes = pickCount(row, ["diggCount"]);
  if (likes !== undefined) video.likes = likes;
  const comments = pickCount(row, ["commentCount"]);
  if (comments !== undefined) video.comments = comments;
  const shares = pickCount(row, ["shareCount"]);
  if (shares !== undefined) video.shares = shares;
  const duration = pickNumber(row, ["videoMeta.duration"]);
  if (duration !== undefined && duration > 0) video.durationSec = duration;
  const clipped = clipCaption(caption);
  if (clipped !== undefined) video.caption = clipped;
  // Slayt (fotoğraf) gönderisi video değildir; izlenmesi viral videoyla karıştırılmaz.
  if (pickBool(row, ["isSlideshow"]) === true) return { ok: false, reason: `slayt gönderisi video değil (${externalId})` };
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

export const tiktokViral: ViralAdapter = { buildJob: buildViralJob, parse: parseViral, followersInResult: true };
