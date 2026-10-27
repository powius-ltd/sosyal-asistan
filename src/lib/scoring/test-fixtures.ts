/**
 * Skorlama birim testlerinin ortak satır kurucuları (DB şekli). Yalnız testler kullanır.
 */
import type { ContentScoringRow, LatestMetricsRow } from "@/lib/scoring/types";

export const WS = "00000000-0000-4000-8000-00000000aaaa";
export const COMPETITOR = "00000000-0000-4000-8000-00000000cccc";
export const NOW = new Date("2026-09-30T12:00:00Z");
const DAY = 86_400_000;

/** `ageDays` gün önce yayınlanmış rakip içeriği (undefined → yayın tarihi NULL). */
export function contentRow(
  id: string,
  ageDays: number | undefined,
  extra: Partial<ContentScoringRow> = {},
): ContentScoringRow {
  return {
    id,
    workspace_id: WS,
    platform: "instagram",
    external_id: `ext-${id}`,
    format: "short_video",
    social_account_id: null,
    competitor_id: COMPETITOR,
    published_at: ageDays === undefined ? null : new Date(NOW.getTime() - ageDays * DAY).toISOString(),
    is_pinned: null,
    ...extra,
  };
}

export function metricsRow(
  id: string,
  views: number | null,
  viewsKind: LatestMetricsRow["views_kind"] = "ig_play_count",
): LatestMetricsRow {
  return { content_item_id: id, views, views_kind: viewsKind };
}
