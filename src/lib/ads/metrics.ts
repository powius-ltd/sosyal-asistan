/** Reklam ölçüleri: günlük satırlardan toplam, sonra oranlar (toplamı topla, sonra böl). Payda 0 ya da alan yok → `undefined` (0 değil). */
import { computeAdMetrics, sumAdMetrics, type AdDailyMetric, type AdMetricSums, type AdMetrics } from "@/lib/domain/ads";

export interface AdMeasure {
  sums: AdMetricSums;
  metrics: AdMetrics;
}

export function measureAd(rows: readonly AdDailyMetric[]): AdMeasure {
  const sums = sumAdMetrics(rows);
  return { sums, metrics: computeAdMetrics(sums) };
}

/**
 * Sonuç başı maliyetin karar için okunuşu: sonuç ölçülüp 0 çıktıysa ve harcama varsa maliyet SONSUZdur (kötü), ölçülmediyse `undefined`.
 * (`computeAdMetrics` 0 sonuçta `undefined` verir; karar için ikisi ayrılır.)
 */
export function costForDecision(sums: AdMetricSums, metrics: AdMetrics): number | undefined {
  if (metrics.costPerResult !== undefined) return metrics.costPerResult;
  if (sums.results === 0 && sums.spend > 0) return Number.POSITIVE_INFINITY;
  return undefined;
}
