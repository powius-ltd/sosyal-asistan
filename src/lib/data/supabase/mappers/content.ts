/**
 * İçerik satırları → `ContentItem` / `ContentDetail` parçaları. Skor önbelleği `content_items` sütunlarından, son
 * metrikler `content_latest_metrics` görünümünden (içerik başına EN SON ölçüm) gelir; sahip bilgisi rakip/kendi hesap
 * dizininden. Ölçülemeyen alan `undefined` (0 değil).
 */
import type { BaselineExplanation, ContentItem, ContentOwner, ContentScore, LatestMetrics, MetricSnapshot } from "@/lib/domain/content";
import type { Tables } from "@/lib/supabase/database.types";
import {
  BASELINE_MIN_N,
  BASELINE_WINDOW,
  parseBasis,
  parseExcluded,
  unmeasuredReason,
} from "@/lib/data/supabase/mappers/baseline";
import { iso, isoOpt, opt, primitiveRecord } from "@/lib/data/supabase/mappers/common";
import { analysisStatusOf, liftTierOf } from "@/lib/data/supabase/mappers/enums";

/** Liste/özet sorgularının içerik sütunları (ağır jsonb `baseline_*` ve `thumbnail_url` YOK; ayrıntıda ayrıca okunur). */
export const CONTENT_COLUMNS =
  "id, workspace_id, platform, social_account_id, competitor_id, external_id, shortcode, url, format, published_at, caption, hashtags, duration_sec, is_pinned, is_paid_partnership, missing_fields, views_kind, baseline_views, baseline_n, lift, lift_tier, low_confidence, immature, cross_score, first_seen_at" as const;

/** `hasTranscript`/`analysisStatus` için gömülü ilişkiler (içerik başına en çok bir satır). */
export const CONTENT_SELECT = `${CONTENT_COLUMNS}, transcripts(id), content_analyses(status)` as const;

export type ContentColumnRow = Pick<
  Tables<"content_items">,
  | "id"
  | "workspace_id"
  | "platform"
  | "social_account_id"
  | "competitor_id"
  | "external_id"
  | "shortcode"
  | "url"
  | "format"
  | "published_at"
  | "caption"
  | "hashtags"
  | "duration_sec"
  | "is_pinned"
  | "is_paid_partnership"
  | "missing_fields"
  | "views_kind"
  | "baseline_views"
  | "baseline_n"
  | "lift"
  | "lift_tier"
  | "low_confidence"
  | "immature"
  | "cross_score"
  | "first_seen_at"
>;

export type ContentRow = ContentColumnRow & {
  transcripts: { id: string }[] | { id: string } | null;
  content_analyses: { status: string }[] | { status: string } | null;
};

export const LATEST_COLUMNS =
  "content_item_id, captured_at, views, views_kind, likes, comments, shares, saves, reach, avg_watch_sec, extra" as const;

export type LatestRow = Pick<
  Tables<"content_latest_metrics">,
  | "content_item_id"
  | "captured_at"
  | "views"
  | "views_kind"
  | "likes"
  | "comments"
  | "shares"
  | "saves"
  | "reach"
  | "avg_watch_sec"
  | "extra"
>;

/** İçeriğin sahibi + dizin anahtarı. */
export function ownerKey(kind: "own" | "competitor", id: string): string {
  return `${kind}:${id}`;
}

/** Satırın sahibinin dizin anahtarı (kendi hesap XOR rakip; DB check zorlar). */
export function ownerKeyOf(row: Pick<ContentColumnRow, "social_account_id" | "competitor_id">): string {
  return row.social_account_id !== null ? ownerKey("own", row.social_account_id) : ownerKey("competitor", row.competitor_id as string);
}

export function toLatestMetrics(latest: LatestRow | undefined): LatestMetrics {
  if (!latest || latest.captured_at === null) return { extra: {} };
  return {
    views: opt(latest.views),
    viewsKind: opt(latest.views_kind),
    likes: opt(latest.likes),
    comments: opt(latest.comments),
    shares: opt(latest.shares),
    saves: opt(latest.saves),
    reach: opt(latest.reach),
    avgWatchSec: opt(latest.avg_watch_sec),
    extra: primitiveRecord(latest.extra),
    capturedAt: iso(latest.captured_at),
  };
}

export function toContentScore(row: ContentColumnRow): ContentScore {
  return {
    viewsKind: opt(row.views_kind),
    baselineViews: opt(row.baseline_views),
    baselineN: opt(row.baseline_n),
    lift: opt(row.lift),
    liftTier: liftTierOf(row.lift_tier),
    lowConfidence: row.low_confidence,
    immature: row.immature,
    crossScore: opt(row.cross_score),
  };
}

function firstStatus(value: ContentRow["content_analyses"]): string | undefined {
  const entry = Array.isArray(value) ? value[0] : (value ?? undefined);
  return entry?.status;
}

function hasAny(value: ContentRow["transcripts"]): boolean {
  return Array.isArray(value) ? value.length > 0 : value !== null && value !== undefined;
}

export function toContentItem(row: ContentRow, owner: ContentOwner, latest: LatestRow | undefined): ContentItem {
  const analysisStatus = firstStatus(row.content_analyses);
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    platform: row.platform,
    externalId: row.external_id,
    shortcode: opt(row.shortcode),
    url: opt(row.url),
    owner,
    format: row.format,
    publishedAt: isoOpt(row.published_at),
    caption: opt(row.caption),
    hashtags: row.hashtags,
    durationSec: opt(row.duration_sec),
    // DB true/false/NULL → domain `true | undefined` (false ve bilinmiyor ikisi de "sabitlenmemiş").
    isPinned: row.is_pinned === true ? true : undefined,
    isPaidPartnership: opt(row.is_paid_partnership),
    missingFields: row.missing_fields,
    metrics: toLatestMetrics(latest),
    score: toContentScore(row),
    hasTranscript: hasAny(row.transcripts),
    analysisStatus: analysisStatus === undefined ? undefined : analysisStatusOf(analysisStatus),
    firstSeenAt: iso(row.first_seen_at),
  };
}

export const SNAPSHOT_COLUMNS =
  "id, content_item_id, captured_at, views, views_kind, likes, comments, shares, saves, reach, avg_watch_sec, extra" as const;

export type SnapshotRow = Pick<
  Tables<"metric_snapshots">,
  "id" | "content_item_id" | "captured_at" | "views" | "views_kind" | "likes" | "comments" | "shares" | "saves" | "reach" | "avg_watch_sec" | "extra"
>;

export function toMetricSnapshot(row: SnapshotRow): MetricSnapshot {
  return {
    id: row.id,
    contentItemId: row.content_item_id,
    capturedAt: iso(row.captured_at),
    views: opt(row.views),
    viewsKind: opt(row.views_kind),
    likes: opt(row.likes),
    comments: opt(row.comments),
    shares: opt(row.shares),
    saves: opt(row.saves),
    reach: opt(row.reach),
    avgWatchSec: opt(row.avg_watch_sec),
    extra: primitiveRecord(row.extra),
  };
}

/** Saklanan baz çizgisi kayıtları (`getContent` ayrıntısında ayrıca okunur). */
export type BaselineStoredRow = Pick<Tables<"content_items">, "baseline_excluded" | "baseline_basis">;

/** `getContent` baz çizgisi açıklaması: saklananı eşler, yeniden hesaplamaz. */
export function toBaselineExplanation(item: ContentItem, stored: BaselineStoredRow): BaselineExplanation {
  const basis = parseBasis(stored.baseline_basis);
  const n = item.score.baselineN ?? basis.length;
  return {
    viewsKind: item.score.viewsKind ?? item.metrics.viewsKind,
    format: item.format,
    targetViews: item.metrics.views,
    medianViews: item.score.baselineViews,
    windowSize: BASELINE_WINDOW,
    n,
    lowConfidence: n < BASELINE_MIN_N,
    basis,
    excluded: parseExcluded(stored.baseline_excluded),
    unmeasuredReason: unmeasuredReason({
      lift: item.score.lift ?? null,
      views: item.metrics.views,
      viewsKind: item.score.viewsKind ?? item.metrics.viewsKind,
      format: item.format,
      ownerKind: item.owner.kind,
      median: item.score.baselineViews,
      n,
    }),
  };
}
