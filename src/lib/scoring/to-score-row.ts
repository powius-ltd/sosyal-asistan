/**
 * Skor + baz çizgisi → `content_items` skor önbelleği sütunları. Saf; DB erişimi yok.
 *
 * Skor (`ItemScore`) ve "bu lift neden böyle?" açıklaması (`baseline_excluded` + `baseline_basis`) AYNI hesaplama
 * anından, aynı girdiyle üretilir ve birlikte yazılır (okurken yeniden hesaplanmaz). Hesaplanamayan değer NULL
 * yazılır (0 değil); sonlu olmayan sayı da NULL olur (DB kısıtları Infinity/NaN kabul etmez).
 */
import type { BaselineBasisEntry, BaselineExcluded, BaselineResult, ItemScore } from "@/lib/metrics/types";
import type {
  BaselineBasisJson,
  BaselineExcludedJson,
  ContentIdentity,
  ScoreColumns,
} from "@/lib/scoring/types";

function finiteOrNull(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** lib/metrics sayaç adları → domain/DB adları (`otherKind` → `differentViewsKind`, `young` → `tooYoung`). */
export function toBaselineExcludedJson(excluded: BaselineExcluded): BaselineExcludedJson {
  return {
    self: excluded.self,
    otherFormat: excluded.otherFormat,
    pinned: excluded.pinned,
    noViews: excluded.noViews,
    differentViewsKind: excluded.otherKind,
    noDate: excluded.noDate,
    tooYoung: excluded.young,
  };
}

/** Baz çizgisine giren içerikler (yeniden eskiye, en çok pencere kadar). */
export function toBaselineBasisJson(basis: readonly BaselineBasisEntry[]): BaselineBasisJson[] {
  return basis.map((entry) => ({
    contentItemId: entry.id,
    views: entry.views,
    publishedAt: entry.publishedAt.toISOString(),
  }));
}

/**
 * `score` ile `baseline` aynı hedefin aynı andaki hesabıdır (`baseline.median`/`n` = `score.baselineViews`/`baselineN`).
 */
export function toScoreColumns(score: ItemScore, baseline: BaselineResult, scoredAt: Date): ScoreColumns {
  return {
    views_kind: score.viewsKind ?? null,
    baseline_views: finiteOrNull(score.baselineViews),
    baseline_n: finiteOrNull(score.baselineN),
    baseline_excluded: toBaselineExcludedJson(baseline.excluded),
    baseline_basis: toBaselineBasisJson(baseline.basis),
    lift: finiteOrNull(score.lift),
    lift_tier: finiteOrNull(score.liftTier),
    low_confidence: score.lowConfidence,
    immature: score.immature,
    cross_score: finiteOrNull(score.crossScore),
    scored_at: scoredAt.toISOString(),
  };
}

/** Satırın kimlik sütunları (toplu yazımda değişmeden geri gönderilir). */
export function pickIdentity(row: ContentIdentity): ContentIdentity {
  const { id, workspace_id, platform, external_id, format, social_account_id, competitor_id } = row;
  return { id, workspace_id, platform, external_id, format, social_account_id, competitor_id };
}
