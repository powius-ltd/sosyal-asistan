/**
 * Apify öğesi → `NormalizedContent` (Instagram; `instagram-reel-scraper` ve eski `instagram-scraper` çıktısı).
 *
 * Uyum: yorumcu ve üçüncü kişi kimlikleri (`latestComments`, `firstComment`, `taggedUsers`, `mentions`, `sponsors`,
 * `owner*`) burada HİÇ okunmaz ve çıktıya geçmez — çıktı yalnız aşağıda adı geçen alanlardan kurulur, ham nesne asla
 * yayılmaz (`...raw` yok). Testli. TEK İSTİSNA (kullanıcı kararı, 2026-09-30): `coauthorProducers` içinden yalnız herkese
 * açık KULLANICI ADLARI okunur (`coauthors`; keşif ağı için) — ad, kimlik, fotoğraf gibi diğer alanlar okunmaz.
 * `ownerHandle` = içeriğin listelendiği profil (`inputUrl`); ortak yazar hesabı (`ownerUsername`, başka biri
 * olabilir) yalnız `inputUrl` yoksa yedek olarak kullanılır.
 */
import {
  asRecord,
  firstDefined,
  pickBool,
  pickDate,
  pickId,
  pickNumber,
  pickString,
  pickStringArray,
  type RawItem,
} from "@/lib/platforms/_shared/field-pick";
import { missingMetricFields, isVideoFormat } from "@/lib/platforms/_shared/metric-fields";
import { normalizedFail, normalizedOk, type Normalized } from "@/lib/platforms/_shared/not-item";
import { parseRows } from "@/lib/platforms/_shared/parse-rows";
import { readAccessError } from "@/lib/platforms/instagram/access-error";
import { resolveFormat } from "@/lib/platforms/instagram/content-format";
import { extractMetrics } from "@/lib/platforms/instagram/content-metrics";
import { contentUrl, shortcodeFromMediaId } from "@/lib/platforms/instagram/content-url";
import { normalizeHandle } from "@/lib/platforms/instagram/handle";
import { pickTranscript } from "@/lib/platforms/instagram/transcript";
import type { NormalizedContent, ParseResult } from "@/lib/platforms/types";

const HASHTAG_IN_TEXT = /#([\p{L}\p{N}_]+)/gu;

/** Aktörün `hashtags` dizisi; yoksa açıklamadan. `#` atılır, tekrarlar elenir (büyük/küçük harf korunur). */
function pickHashtags(item: RawItem, caption: string | undefined): string[] {
  const listed = pickStringArray(item, ["hashtags"]) ?? [...(caption ?? "").matchAll(HASHTAG_IN_TEXT)].map((m) => m[1]);
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const tag of listed) {
    const clean = tag.trim().replace(/^#+/, "");
    const key = clean.toLowerCase();
    if (clean === "" || seen.has(key)) continue;
    seen.add(key);
    tags.push(clean);
  }
  return tags;
}

function pickOwnerHandle(item: RawItem): string | undefined {
  const fromFeed = normalizeHandle(pickString(item, ["inputUrl"]) ?? "");
  const handle = fromFeed || normalizeHandle(pickString(item, ["ownerUsername"]) ?? "");
  return handle || undefined;
}

/** Bir içerikte saklanan en çok ortak yazar (kötü niyetli/bozuk satır listeyi şişirmesin). */
export const COAUTHORS_MAX = 10;

/**
 * `coauthorProducers: [{ username, … }]` → yalnız HERKESE AÇIK kullanıcı adları (geçerli biçimde, küçük harf, tekrarsız,
 * içeriğin sahibi hariç). Kayıtların başka hiçbir alanı (ad, kimlik, fotoğraf, doğrulama) okunmaz. Alan yok/boşsa undefined.
 */
function pickCoauthors(item: RawItem, ownerHandle: string | undefined): string[] | undefined {
  const raw = firstDefined(item, ["coauthorProducers"]);
  if (!Array.isArray(raw)) return undefined;
  const handles = new Set<string>();
  for (const entry of raw) {
    const name = typeof entry === "string" ? entry : pickString(asRecord(entry) ?? {}, ["username", "userName"]);
    const handle = normalizeHandle(name ?? "");
    if (handle !== "" && handle !== ownerHandle) handles.add(handle);
    if (handles.size >= COAUTHORS_MAX) break;
  }
  return handles.size > 0 ? [...handles] : undefined;
}

function pickPermalink(item: RawItem, shortcode: string | undefined, externalId: string): string | undefined {
  const given = pickString(item, ["url"]);
  if (given && /^https:\/\//i.test(given)) return given;
  const code = shortcode ?? shortcodeFromMediaId(externalId);
  return code ? contentUrl({ externalId, shortcode: code }) : undefined;
}

export function normalizeContent(item: RawItem): Normalized<NormalizedContent> {
  const shortcode = pickString(item, ["shortCode", "shortcode", "code"]);
  const externalId = pickId(item, ["id", "pk"]) ?? shortcode;
  if (!externalId) return normalizedFail("içerik kimliği yok (id/shortCode)");

  const format = resolveFormat(item);
  if (!format) return normalizedFail(`içerik biçimi belirlenemedi (${externalId})`);

  const caption = pickString(item, ["caption"]);
  const video = isVideoFormat(format);
  const duration = video ? pickNumber(item, ["videoDuration", "duration"]) : undefined;
  const metrics = extractMetrics(item, format);
  const isPinned = pickBool(item, ["isPinned"]) === true ? true : undefined;
  const mediaUrl = video ? pickString(item, ["videoUrl"]) : undefined;

  const content: NormalizedContent = {
    platform: "instagram",
    externalId,
    format,
    hashtags: pickHashtags(item, caption),
    metrics,
    missingFields: missingMetricFields(metrics, format),
  };
  if (shortcode) content.shortcode = shortcode;
  const url = pickPermalink(item, shortcode, externalId);
  if (url) content.url = url;
  const ownerHandle = pickOwnerHandle(item);
  if (ownerHandle) content.ownerHandle = ownerHandle;
  const publishedAt = pickDate(item, ["timestamp", "takenAt"]);
  if (publishedAt) content.publishedAt = publishedAt;
  if (caption) content.caption = caption;
  if (duration !== undefined && duration > 0) content.durationSec = Math.round(duration * 100) / 100;
  if (isPinned) content.isPinned = true;
  const paid = pickBool(item, ["paidPartnership", "isPaidPartnership"]);
  if (paid !== undefined) content.isPaidPartnership = paid;
  const coauthors = pickCoauthors(item, ownerHandle);
  if (coauthors) content.coauthors = coauthors;
  const transcript = pickTranscript(item);
  if (transcript) content.transcript = transcript;
  if (mediaUrl && /^https:\/\//i.test(mediaUrl)) content.ephemeralMediaUrl = mediaUrl; // geçici: DB'ye YAZILMAZ
  return normalizedOk(content);
}

/** Dataset satırları → içerikler + öğe olmayan satırlar (sebebiyle) + erişim hatası (sonuç tümüyle boşsa). */
export function parseContent(raw: unknown[]): ParseResult<NormalizedContent> {
  return parseRows(raw, normalizeContent, readAccessError);
}
