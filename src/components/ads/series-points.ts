import type { AdDailyMetric } from "@/lib/domain/ads";

export interface AdSeriesPoint {
  /** YYYY-AA-GG. */
  date: string;
  spend: number;
  /** O günün bir sonuç maliyeti; sonuç ölçülmemişse ya da 0 ise `undefined` (0 değil: grafikte boşluk). */
  costPerResult?: number;
}

/** Günlük ölçülerden grafik noktaları (tarih sırasıyla). Sonuçsuz günde maliyet hesaplanmaz. */
export function seriesPointsOf(series: readonly AdDailyMetric[]): AdSeriesPoint[] {
  return [...series]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((row) => ({
      date: row.date,
      spend: row.spend,
      ...(row.results !== undefined && row.results > 0 ? { costPerResult: row.spend / row.results } : {}),
    }));
}
