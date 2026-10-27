/**
 * Apify öğesi → `NormalizedContent` (TikTok; `clockworks/tiktok-scraper` video satırı).
 *
 * Çıktı alanları aktörün veri kümesi şemasından doğrulandı (yapı 0.0.616, 2026-10-13): `id`, `text`, `createTime`, `createTimeISO`,
 * `webVideoUrl`, `isAd`, `isSponsored`, `isPinned`, `isSlideshow`, `videoMeta.duration`, `hashtags[].name`, `playCount`, `diggCount`,
 * `commentCount`, `shareCount`, `collectCount`, `repostCount`, `authorMeta.name`, `input`. Canlı koşuyla (gerçek veri) DOĞRULANMADI:
 * bu yüzden her alan savunmacı okunur; olmayan alan hiç yazılmaz (`undefined ≠ 0`).
 *
 * Uyum: çıktı yalnız aşağıda adı geçen alanlardan kurulur, ham nesne asla yayılmaz (`...raw` yok). HİÇ okunmayanlar: yorumlar
 * (`comments`, `commentsDatasetUrl`), anılanlar (`mentions`, `detailedMentions`), düet / dikiş ve müzik sahibi (`musicMeta`), efektler,
 * konum (`locationMeta`, `locationCreated`), yazarın adı / kimliği / fotoğrafı / biyografisi (`authorMeta.nickName`, `id`, `avatar`, …).
 * `authorMeta`'dan YALNIZ herkese açık kullanıcı adı okunur (`ownerHandle`: içeriğin sahibi). Testli (`privacy.test.ts`).
 *
 * Video adresi: `mediaUrls` / `videoMeta.downloadAddr` / kapak adresleri OKUNMAZ, `ephemeralMediaUrl` hiç yazılmaz. TikTok video adresi
 * oturumsuz indirilemez (aktör yalnız "videoyu indir" açıkken kendi deposuna yazar; o seçenek kapalıdır) → bu platformda video incelemesi yok.
 */
import { asRecord, firstDefined, pickBool, pickCount, pickDate, pickId, pickNumber, pickString, type RawItem } from "@/lib/platforms/_shared/field-pick";
import { missingMetricFields } from "@/lib/platforms/_shared/metric-fields";
import { normalizedFail, normalizedOk, type Normalized } from "@/lib/platforms/_shared/not-item";
import { parseRows } from "@/lib/platforms/_shared/parse-rows";
import { contentUrl, parseTikTokContentUrl, TIKTOK_VIDEO_ID_PATTERN } from "@/lib/platforms/tiktok/content-url";
import { readAccessError, toCommonErrorRow } from "@/lib/platforms/tiktok/error-rows";
import { normalizeHandle } from "@/lib/platforms/tiktok/handle";
import type { ContentFormat, NormalizedContent, NormalizedMetrics, ParseResult } from "@/lib/platforms/types";

/** Ölçülmüş süre bunu aşan video "uzun video" sayılır (Instagram'daki eşikle aynı: kısa video baz çizgisine girmez). */
export const SHORT_VIDEO_MAX_SEC = 180;
/** Bir içerikte saklanan en çok etiket (bozuk satır listeyi şişirmesin). */
const HASHTAGS_MAX = 60;
const HASHTAG_IN_TEXT = /#([\p{L}\p{N}_]+)/gu;

/** `hashtags: [{ name }]` (ya da düz metin listesi); yoksa açıklamadan. `#` atılır, tekrarlar elenir (büyük/küçük harf korunur). */
function pickHashtags(item: RawItem, caption: string | undefined): string[] {
  const raw = firstDefined(item, ["hashtags"]);
  const named = Array.isArray(raw)
    ? raw.map((entry) => (typeof entry === "string" ? entry : pickString(asRecord(entry) ?? {}, ["name"]))).filter((name): name is string => name !== undefined)
    : [];
  // Liste yok ya da boşsa açıklamadaki etiketler okunur.
  const listed = named.length > 0 ? named : [...(caption ?? "").matchAll(HASHTAG_IN_TEXT)].map((m) => m[1]);
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const tag of listed) {
    const clean = tag.trim().replace(/^#+/, "");
    const key = clean.toLowerCase();
    if (clean === "" || seen.has(key)) continue;
    seen.add(key);
    tags.push(clean);
    if (tags.length >= HASHTAGS_MAX) break;
  }
  return tags;
}

/** Slayt (fotoğraf) gönderisi → karusel; video → süreye göre kısa / uzun (süre yoksa kısa). */
function resolveFormat(item: RawItem, duration: number | undefined): ContentFormat {
  if (pickBool(item, ["isSlideshow"]) === true) return "carousel";
  return duration !== undefined && duration > SHORT_VIDEO_MAX_SEC ? "long_video" : "short_video";
}

/**
 * Sayılar: oynatma (`tt_play_count`), beğeni, yorum, paylaşım, kaydetme. Yalnız aktörün verdiği sonlu ve ≥ 0 sayı yazılır.
 * Yeniden paylaşım (`repostCount`) ortak metrik değildir: `extra`'da saklanır.
 */
function extractMetrics(item: RawItem): NormalizedMetrics {
  const metrics: NormalizedMetrics = { extra: {} };
  const views = pickCount(item, ["playCount"]);
  if (views !== undefined) {
    metrics.views = views;
    metrics.viewsKind = "tt_play_count";
  }
  const likes = pickCount(item, ["diggCount"]);
  if (likes !== undefined) metrics.likes = likes;
  const comments = pickCount(item, ["commentCount"]);
  if (comments !== undefined) metrics.comments = comments;
  const shares = pickCount(item, ["shareCount"]);
  if (shares !== undefined) metrics.shares = shares;
  const saves = pickCount(item, ["collectCount"]);
  if (saves !== undefined) metrics.saves = saves;
  const reposts = pickCount(item, ["repostCount"]);
  if (reposts !== undefined) metrics.extra.repostCount = reposts;
  return metrics;
}

/** Aktörün verdiği kalıcı adres (yalnız tanınan TikTok içerik bağlantısıysa); değilse kimlikten kurulan yedek. */
function pickPermalink(item: RawItem, externalId: string): string {
  const given = pickString(item, ["webVideoUrl"])?.trim();
  if (given && /^https:\/\//i.test(given) && parseTikTokContentUrl(given)?.shortcode === externalId) return given.split(/[?#]/)[0];
  return contentUrl({ externalId });
}

export function normalizeContent(item: RawItem): Normalized<NormalizedContent> {
  const externalId = pickId(item, ["id"]);
  if (!externalId) return normalizedFail("içerik kimliği yok (id)");
  if (!TIKTOK_VIDEO_ID_PATTERN.test(externalId)) return normalizedFail(`içerik kimliği sayısal değil (${externalId.slice(0, 40)})`);

  const rawDuration = pickNumber(item, ["videoMeta.duration"]);
  const duration = rawDuration !== undefined && rawDuration > 0 ? rawDuration : undefined;
  const format = resolveFormat(item, duration);
  const caption = pickString(item, ["text"]);
  const metrics = extractMetrics(item);

  const content: NormalizedContent = {
    platform: "tiktok",
    externalId,
    // TikTok'ta ayrı kısa kod yok: bağlantıdaki kimlik = video kimliği (fikir ↔ video bağı bununla eşleşir).
    shortcode: externalId,
    url: pickPermalink(item, externalId),
    format,
    hashtags: pickHashtags(item, caption),
    metrics,
    missingFields: missingMetricFields(metrics, format),
  };
  // İçeriğin sahibi: yazarın herkese açık kullanıcı adı; yoksa işin hedefi (`input`).
  const ownerHandle = normalizeHandle(pickString(item, ["authorMeta.name"]) ?? "") || normalizeHandle(pickString(item, ["input"]) ?? "");
  if (ownerHandle) content.ownerHandle = ownerHandle;
  const publishedAt = pickDate(item, ["createTimeISO", "createTime"]);
  if (publishedAt) content.publishedAt = publishedAt;
  if (caption) content.caption = caption;
  if (duration !== undefined && format !== "carousel") content.durationSec = Math.round(duration * 100) / 100;
  if (pickBool(item, ["isPinned"]) === true) content.isPinned = true;
  const isAd = pickBool(item, ["isAd"]);
  const isSponsored = pickBool(item, ["isSponsored"]);
  if (isAd !== undefined || isSponsored !== undefined) content.isPaidPartnership = isAd === true || isSponsored === true;
  return normalizedOk(content);
}

/** Dataset satırları → içerikler + öğe olmayan satırlar (sebebiyle) + erişim hatası (sonuç tümüyle boşsa). */
export function parseContent(raw: unknown[]): ParseResult<NormalizedContent> {
  return parseRows(raw.map(toCommonErrorRow), normalizeContent, () => readAccessError(raw));
}
