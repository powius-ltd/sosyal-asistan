/**
 * Karşılaştırma içgörüleri ve haftalık plan taslağı için ORTAK lift grup özeti (süre kovası, CTA türü …): tek kural, iki
 * tüketici (`views/insights.ts`, `lib/insights/**`), böylece aynı grup iki ekranda iki ayrı sayı göstermez.
 *  - Lift = içeriğin skor önbelleğindeki değer (`score.lift`); baz çizgisi kuralı (sabitlenmiş ve <3 günlük içerik baz çizgisine
 *    girmez) `lib/metrics/baseline.ts`'te uygulanmıştır, burada yeniden hesaplanmaz.
 *  - Olgunlaşmamış (<3 gün, `score.immature`) içeriğin lift'i YANILTICIDIR (izlenme alt sınırdır): lift özetine girmez, yalnız
 *    `n`'e (grubun video sayısı) sayılır. `usableLift` bu tek kuraldır.
 */
import { type ContentItem } from "@/lib/domain/content";
import type { GroupedLift, LiftGroupStat } from "@/lib/domain/insights";
import { summarizeLiftSamples } from "@/lib/metrics/hook-lift";
import { median } from "@/lib/metrics/stats";
import { medianViewsInDominantKind } from "@/lib/metrics/views-summary";

/** Gruplarda/özetlerde kullanılabilir lift: ölçülmüş VE olgun; aksi halde undefined (0 değil). */
export function usableLift(item: Pick<ContentItem, "score">): number | undefined {
  return item.score.immature ? undefined : item.score.lift;
}

export const viewsSample = (c: ContentItem) => ({ format: c.format, views: c.metrics.views, viewsKind: c.metrics.viewsKind });

export const definedNumbers = (values: readonly (number | undefined)[]): number[] => values.filter((v): v is number => v !== undefined);

/** Ölçülmüş (olgun) liftlerin medyanı; hiçbiri yoksa undefined. */
export const medianUsableLift = (items: readonly ContentItem[]): number | undefined => median(definedNumbers(items.map(usableLift)));

/**
 * Bir grubun (süre kovası, CTA türü, hook türü …) lift özeti. Güven örnek sayısından gelir ve baz çizgisi tavanına tabidir:
 * ölçülmüş videoların ≥ %50'sinin baz çizgisi düşük güvenliyse (`score.lowConfidence`) en çok orta (`capConfidenceForBaseline`).
 */
export function groupStat<K extends string>(key: K, items: readonly ContentItem[]): LiftGroupStat<K> {
  const summary = summarizeLiftSamples(items.map((c) => ({ lift: usableLift(c), lowBaseline: c.score.lowConfidence })));
  return {
    key,
    n: items.length,
    liftN: summary.n,
    medianLift: summary.medianLift,
    outlierCount: summary.outlierCount,
    medianViews: medianViewsInDominantKind(items.map(viewsSample)).median,
    confidence: summary.confidence,
    lowBaselineShare: summary.lowBaselineShare,
  };
}

/** İçerikleri `keyOf` anahtarına göre gruplar; anahtarı olmayan (ör. süresi bilinmeyen) içerik gruba girmez. Sıra = `order`. */
export function groupBy<K extends string>(items: readonly ContentItem[], keyOf: (c: ContentItem) => K | undefined, order: readonly K[]): LiftGroupStat<K>[] {
  const buckets = new Map<K, ContentItem[]>();
  for (const item of items) {
    const key = keyOf(item);
    if (key === undefined) continue;
    buckets.set(key, [...(buckets.get(key) ?? []), item]);
  }
  return order.flatMap((key) => (buckets.has(key) ? [groupStat(key, buckets.get(key) ?? [])] : []));
}

export function groupedLift<K extends string>(own: readonly ContentItem[], rivals: readonly ContentItem[], keyOf: (c: ContentItem) => K | undefined, order: readonly K[]): GroupedLift<K> {
  return { own: groupBy(own, keyOf, order), competitors: groupBy(rivals, keyOf, order) };
}
