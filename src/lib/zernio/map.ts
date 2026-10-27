/**
 * Saf eşleme: Zernio gönderisi → `content_items` alanları + `metric_snapshots` ölçümü (DB'ye dokunmaz).
 *
 * - Yalnız yayınlanmış Instagram Reels alınır; kimliği (kısa kod) bağlantıdan çıkarılır.
 * - `external_id` = kısa kodun base64 çözümü (Instagram medya kimliği): Apify'ın `external_id`'siyle AYNI, böylece sonradan
 *   Apify aynı Reels'i yazarsa çift kayıt oluşmaz.
 * - Ölçülemeyen alan `undefined`/NULL kalır (0 değil) ve `missingFields`'a girer. `views` yoksa `impressions` views yerine
 *   KULLANILMAZ (farklı büyüklük; `extra`'da durur).
 * - `igReelsAvgWatchTime` milisaniyedir → saniyeye çevrilir.
 */
import { parseInstagramContentUrl } from "@/lib/platforms/instagram/shortcode";
import type { SnapshotPoint } from "@/lib/outcomes/checkpoints";
import type { ZernioPost } from "@/lib/zernio/schema";

const SHORTCODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const HASHTAG = /#([\p{L}\p{N}_]+)/gu;

/** Kısa kod → Instagram medya kimliği (ondalık metin). Geçersiz karakter → undefined. */
export function shortcodeToMediaId(shortcode: string): string | undefined {
  let value = BigInt(0);
  for (const char of shortcode) {
    const index = SHORTCODE_ALPHABET.indexOf(char);
    if (index < 0) return undefined;
    value = value * BigInt(64) + BigInt(index);
  }
  return shortcode.length > 0 ? value.toString() : undefined;
}

export interface ZernioContentFields {
  externalId: string;
  shortcode: string;
  url: string;
  publishedAt?: string;
  caption?: string;
  hashtags: string[];
  durationSec?: number;
  missingFields: string[];
}

export interface ZernioMetrics {
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  reach?: number;
  avgWatchSec?: number;
  /** Sayısal ek ölçümler (impressions, profile_views, …); yalnız tanımlı olanlar. */
  extra: Record<string, number>;
}

export interface MappedZernioPost {
  content: ZernioContentFields;
  metrics: ZernioMetrics;
}

export type SkipReason = "not_published" | "not_instagram" | "not_reel" | "no_url";

function numberOrUndefined(value: number | null | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function mapZernioPost(post: ZernioPost): { mapped: MappedZernioPost } | { skipped: SkipReason } {
  if (post.status !== "published") return { skipped: "not_published" };
  if (post.platform !== "instagram") return { skipped: "not_instagram" };
  if (post.mediaProductType?.toUpperCase() !== "REELS") return { skipped: "not_reel" };
  const parsed = post.platformPostUrl ? parseInstagramContentUrl(post.platformPostUrl) : undefined;
  const externalId = parsed ? shortcodeToMediaId(parsed.shortcode) : undefined;
  if (!parsed || !externalId) return { skipped: "no_url" };

  const a = post.analytics ?? undefined;
  const metrics: ZernioMetrics = {
    views: numberOrUndefined(a?.views),
    likes: numberOrUndefined(a?.likes),
    comments: numberOrUndefined(a?.comments),
    shares: numberOrUndefined(a?.shares),
    saves: numberOrUndefined(a?.saves),
    reach: numberOrUndefined(a?.reach),
    avgWatchSec: a?.igReelsAvgWatchTime == null ? undefined : a.igReelsAvgWatchTime / 1000,
    extra: {},
  };
  const extras: [string, number | null | undefined][] = [
    ["impressions", a?.impressions],
    ["profile_views", a?.profileViews],
    ["reposts", a?.reposts],
    ["replays", a?.replays],
    ["completion_rate", a?.completionRate],
    ["skip_rate", a?.reelsSkipRate],
  ];
  for (const [key, value] of extras) {
    const n = numberOrUndefined(value);
    if (n !== undefined) metrics.extra[key] = n;
  }

  const caption = post.content?.trim() || undefined;
  const publishedAt = post.publishedAt && !Number.isNaN(Date.parse(post.publishedAt)) ? new Date(post.publishedAt).toISOString() : undefined;
  const missingFields = (["views", "likes", "comments", "shares", "saves", "reach", "avgWatchSec"] as const)
    .filter((key) => metrics[key] === undefined)
    .map((key) => (key === "avgWatchSec" ? "avg_watch_sec" : key));

  return {
    mapped: {
      content: {
        externalId,
        shortcode: parsed.shortcode,
        url: `https://www.instagram.com/reel/${parsed.shortcode}/`,
        publishedAt,
        caption,
        hashtags: caption ? [...new Set([...caption.matchAll(HASHTAG)].map((m) => m[1].toLowerCase()))] : [],
        durationSec: numberOrUndefined(a?.videoDurationSeconds),
        missingFields,
      },
      metrics,
    },
  };
}

/** Kontrol noktası hesabının okuduğu nokta (`SnapshotPoint`); izlenme türü Zernio/Instagram `views` = `ig_views`. */
export function toSnapshotPoint(metrics: ZernioMetrics, capturedAt: string, ownerFollowers?: number): SnapshotPoint {
  return {
    capturedAt,
    views: metrics.views,
    viewsKind: metrics.views === undefined ? undefined : "ig_views",
    ownerFollowers,
  };
}
