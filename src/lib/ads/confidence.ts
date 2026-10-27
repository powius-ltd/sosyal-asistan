/** Karar güveni: harcama, gösterim, sonuç ve gün sayısından `low | medium | high`. Eşikler `AdRules`; ölçülmeyen sonuç güveni yükseltmez. */
import type { AdRules } from "@/lib/ads/rules";
import type { AdMetricSums } from "@/lib/domain/ads";
import type { ConfidenceLevel } from "@/lib/domain/weekly-plan";

export function adConfidenceOf(sums: AdMetricSums, ageDays: number, rules: AdRules): ConfidenceLevel {
  if (sums.spend <= 0 || sums.impressions < rules.confidenceMinImpressions) return "low";
  const results = sums.results ?? 0;
  const days = Math.max(ageDays, sums.days);
  if (results >= rules.confidenceHighResults && days >= rules.confidenceHighDays) return "high";
  if (results >= rules.confidenceMediumResults && days >= rules.confidenceMediumDays) return "medium";
  return "low";
}
