/**
 * Günlük seriden ölçüler: yorgunluk, istikrar, ani kötüleşme. Üçü de sessiz `true` / `false` DÖNMEZ: gün ya da alan yetmezse `value`
 * `undefined` ve `reason` kodu doludur (ekran "ölçülemedi" der, "yorgun değil" demez). Eşikler `AdRules`'tan.
 */
import { shiftDay } from "@/lib/ads/days";
import type { AdRules } from "@/lib/ads/rules";
import type { AdDailyMetric } from "@/lib/domain/ads";

export type SeriesReason = "few_days" | "few_spend_days" | "frequency_unmeasured" | "clicks_unmeasured" | "results_unmeasured";

export interface SeriesMeasure {
  /** Ölçülemediyse `undefined`. */
  value?: boolean;
  reason?: SeriesReason;
}

const byDate = (rows: readonly AdDailyMetric[]): AdDailyMetric[] => [...rows].sort((a, b) => a.date.localeCompare(b.date));
const sum = (rows: readonly AdDailyMetric[], pick: (row: AdDailyMetric) => number | undefined): number | undefined => {
  let total: number | undefined;
  for (const row of rows) {
    const value = pick(row);
    if (value !== undefined) total = (total ?? 0) + value;
  }
  return total;
};

/**
 * Yorgunluk: son 7 günün GÜNLÜK görülme sıklığı (gösterim ağırlıklı) `fatigueDailyFrequency` eşiğini AŞIYOR ve tıklama oranı ilk 7 günden
 * son 7 güne düşmüş. Dönem sıklığı (`fatigueFrequencyMin`, erişim tabanlı) günlük satırdan kurulamaz; bkz. `rules.ts`.
 */
export function measureFatigue(rows: readonly AdDailyMetric[], rules: AdRules): SeriesMeasure & { frequency?: number; clickRateDrop?: number } {
  const sorted = byDate(rows);
  if (new Set(sorted.map((row) => row.date)).size < rules.fatigueMinDays) return { reason: "few_days" };
  const first = sorted.slice(0, 7);
  const last = sorted.slice(-7);
  const weighted = last.filter((row) => row.frequency !== undefined && row.impressions > 0);
  const impressions = weighted.reduce((total, row) => total + row.impressions, 0);
  if (impressions <= 0) return { reason: "frequency_unmeasured" };
  const frequency = weighted.reduce((total, row) => total + (row.frequency as number) * row.impressions, 0) / impressions;
  const rate = (part: readonly AdDailyMetric[]): number | undefined => {
    const clicks = sum(part, (row) => row.clicks);
    const shown = part.reduce((total, row) => total + row.impressions, 0);
    return clicks === undefined || shown <= 0 ? undefined : clicks / shown;
  };
  if ([...first, ...last].some((row) => row.clicks === undefined)) return { reason: "clicks_unmeasured", frequency };
  const before = rate(first);
  const after = rate(last);
  if (before === undefined || after === undefined || before <= 0) return { reason: "clicks_unmeasured", frequency };
  const drop = (before - after) / before;
  return { value: frequency > rules.fatigueDailyFrequency && drop >= rules.fatigueCtrDropShare, frequency, clickRateDrop: drop };
}

/** İstikrar: günlük sonuç maliyetinin değişim katsayısı (std / ortalama) eşiğin altında. En az `stabilityMinSpendDays` harcamalı gün. */
export function measureStability(rows: readonly AdDailyMetric[], rules: AdRules): SeriesMeasure & { variation?: number } {
  const spendDays = rows.filter((row) => row.spend > 0);
  if (spendDays.length < rules.stabilityMinSpendDays) return { reason: "few_spend_days" };
  const costs = spendDays.filter((row) => row.results !== undefined && row.results > 0).map((row) => row.spend / (row.results as number));
  if (costs.length < rules.stabilityMinSpendDays) return { reason: "results_unmeasured" };
  // Harcama olup ölçülmüş 0 sonuç çıkan gün en kötü istikrarsızlıktır (sonsuz maliyet), sessizce atlanmaz.
  if (spendDays.some((row) => row.results === 0)) return { value: false, variation: Number.POSITIVE_INFINITY };
  const mean = costs.reduce((total, cost) => total + cost, 0) / costs.length;
  const variance = costs.reduce((total, cost) => total + (cost - mean) ** 2, 0) / costs.length;
  const variation = Math.sqrt(variance) / mean;
  return { value: variation < rules.stabilityMaxVariation, variation };
}

/** Ani kötüleşme: son 7 günün sonuç maliyeti, önceki 21 günün `worseningMultiple` katından yüksek. 28 günün hepsi dolu olmalı. */
export function measureWorsening(rows: readonly AdDailyMetric[], rules: AdRules): SeriesMeasure & { ratio?: number } {
  const sorted = byDate(rows);
  const last = sorted.at(-1)?.date;
  const span = rules.worseningRecentDays + rules.worseningBaselineDays;
  if (last === undefined) return { reason: "few_days" };
  const windowStart = shiftDay(last, -(span - 1));
  const inWindow = sorted.filter((row) => row.date >= windowStart);
  if (new Set(inWindow.map((row) => row.date)).size < Math.max(rules.worseningMinDays, span)) return { reason: "few_days" };
  const recentStart = shiftDay(last, -(rules.worseningRecentDays - 1));
  const cost = (part: readonly AdDailyMetric[]): number | undefined => {
    const results = sum(part, (row) => row.results);
    const spend = part.reduce((total, row) => total + row.spend, 0);
    return results === undefined || results <= 0 ? undefined : spend / results;
  };
  const recent = cost(inWindow.filter((row) => row.date >= recentStart));
  const earlier = cost(inWindow.filter((row) => row.date < recentStart));
  if (recent === undefined || earlier === undefined) return { reason: "results_unmeasured" };
  const ratio = recent / earlier;
  return { value: ratio > rules.worseningMultiple, ratio };
}
