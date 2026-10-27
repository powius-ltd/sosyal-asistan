/**
 * DB satırı → `ScorableItem` (lib/metrics girdisi). Saf; DB erişimi yok.
 *
 * Ölçülemeyen = undefined (0 değil): NULL views/viewsKind/yayın tarihi undefined olur, 0 views ölçülmüş sıfırdır.
 * `is_pinned` yalnız `true` ise taşınır (NULL = bilinmiyor, false = sabitlenmemiş; ikisi de baz çizgisine girer).
 */
import type { ScorableItem } from "@/lib/metrics/types";
import type { ContentScoringRow, LatestMetricsRow } from "@/lib/scoring/types";

/** ISO zaman damgası → Date; NULL ya da geçersiz → undefined. */
export function parseTimestamp(value: string | null | undefined): Date | undefined {
  if (value === null || value === undefined) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** Sonlu sayı değilse (NULL, NaN, Infinity) undefined. */
function measuredNumber(value: number | null | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/**
 * İçerik satırı + en son ölçüm → skorlanabilir öğe. `metrics` yoksa (hiç ölçülmemiş) views ve viewsKind undefined.
 */
export function toScorableItem(row: ContentScoringRow, metrics: LatestMetricsRow | undefined): ScorableItem {
  const item: ScorableItem = { id: row.id, format: row.format };
  const publishedAt = parseTimestamp(row.published_at);
  if (publishedAt) item.publishedAt = publishedAt;
  if (row.is_pinned === true) item.isPinned = true;
  const views = measuredNumber(metrics?.views);
  if (views !== undefined) item.views = views;
  if (metrics?.views_kind) item.viewsKind = metrics.views_kind;
  return item;
}
