/**
 * Bir hesabın tüm içeriklerini skorlar: baz çizgisi + lift + kademe + düşük güven +
 * olgunlaşmamış (<3 gün) + crossScore. Çıktı `content_items` skor önbelleğine birebir yazılır.
 */
import { accountBaseline, BASELINE_DEFAULTS, isYoung } from "@/lib/metrics/baseline";
import { crossScore } from "@/lib/metrics/cross-account";
import { isValidDate } from "@/lib/metrics/dates";
import { lift, liftTier } from "@/lib/metrics/lift";
import type { ItemScore, ScorableItem } from "@/lib/metrics/types";

/**
 * `followers`: hesabın takipçi sayısı (bilinmiyorsa undefined → crossScore undefined).
 * `now`: referans an (yaş/olgunluk hesabı için; saf ve test edilebilir kalsın diye parametre).
 * Yayın tarihi bilinmeyen içerik `immature: false` (genç olduğu gösterilemez) ve baz çizgisine girmez.
 */
export function scoreAccount(
  items: readonly ScorableItem[],
  followers: number | undefined,
  now: Date,
): Map<string, ItemScore> {
  // Baz çizgisi yalnız aynı format + viewsKind içinden gelir; grupları bir kez ayır.
  const groups = new Map<string, ScorableItem[]>();
  const keyOf = (it: ScorableItem) => `${it.format}|${it.viewsKind ?? ""}`;
  for (const it of items) {
    const group = groups.get(keyOf(it));
    if (group) group.push(it);
    else groups.set(keyOf(it), [it]);
  }

  const scores = new Map<string, ItemScore>();
  for (const it of items) {
    const baseline = accountBaseline(groups.get(keyOf(it)) ?? [], it, { now });
    const l = lift(it.views, baseline);
    scores.set(it.id, {
      viewsKind: it.viewsKind,
      baselineViews: baseline.median,
      baselineN: baseline.n,
      lift: l,
      liftTier: liftTier(l),
      lowConfidence: baseline.lowConfidence,
      immature: isValidDate(it.publishedAt) && isYoung(it.publishedAt, now, BASELINE_DEFAULTS.minAgeDays),
      crossScore: crossScore(it.views, followers),
    });
  }
  return scores;
}
