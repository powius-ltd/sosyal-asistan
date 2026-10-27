/**
 * Persentil dilimi ataması — Python `core/metrics/outliers.py` birebir.
 *
 * LLM ajanlarına düz içerik değil dilim etiketli içerik gider; "üst dilim şöyle açıyor,
 * alt dilim böyle" kontrastı ancak bu etiketle kurulur. Tamamen deterministik.
 * (Lift kademesi — 1.5/2/3/5x — ayrı bir kavramdır: `lift.ts` / `LIFT_TIER_MIN`.)
 */
import { engagementOf } from "@/lib/metrics/engagement";
import { percentileRank } from "@/lib/metrics/stats";
import type { MetricItem } from "@/lib/metrics/types";
import type { ViewsKind } from "@/lib/platforms/types";

export type PercentileTier = "top" | "mid" | "bottom";

export interface TieredItem<T> {
  item: T;
  metricValue: number;
  /** 0–100, yüksek = iyi. */
  percentile: number;
  tier: PercentileTier;
}

/** Python `metric="play_count"` karşılığı `views`'tır ve tek viewsKind içinde hesaplanır. */
export type TierMetric = { metric: "engagement" } | { metric: "views"; viewsKind: ViewsKind };

/** ≥75 → top, ≤25 → bottom, arası mid. */
export function tierFromPercentile(pct: number): PercentileTier {
  if (pct >= 75) return "top";
  if (pct <= 25) return "bottom";
  return "mid";
}

function metricValue(it: MetricItem, by: TierMetric): number | undefined {
  if (by.metric === "engagement") return engagementOf(it);
  return it.viewsKind === by.viewsKind ? it.views : undefined;
}

/** Metriği ölçülemeyen içerik atlanır; sonuç persentile göre azalan (eşitlikte girdi sırası). */
export function assignTiers<T extends MetricItem>(
  items: readonly T[],
  by: TierMetric = { metric: "engagement" },
): TieredItem<T>[] {
  const scored: { item: T; value: number }[] = [];
  for (const item of items) {
    const value = metricValue(item, by);
    if (value !== undefined) scored.push({ item, value });
  }
  if (scored.length === 0) return [];

  const values = scored.map((s) => s.value);
  return scored
    .map(({ item, value }) => {
      const percentile = percentileRank(values, value);
      return { item, metricValue: value, percentile, tier: tierFromPercentile(percentile) };
    })
    .sort((a, b) => b.percentile - a.percentile);
}

/**
 * En iyi `topN` ve en kötü `bottomN`. Python gibi liste `topN`'den uzun değilse alt grup boştur;
 * kısa listede iki grup çakışabilir (Python davranışı). Bilinçli sapma: `bottomN = 0` → boş
 * (Python'da `lst[-0:]` tüm listeyi döndürür).
 */
export function topAndBottom<T>(
  tiered: readonly TieredItem<T>[],
  o: { topN: number; bottomN: number },
): { top: TieredItem<T>[]; bottom: TieredItem<T>[] } {
  if (tiered.length === 0) return { top: [], bottom: [] };
  const top = tiered.slice(0, Math.max(0, o.topN));
  const bottom =
    tiered.length > o.topN && o.bottomN > 0 ? tiered.slice(Math.max(0, tiered.length - o.bottomN)) : [];
  return { top, bottom };
}
