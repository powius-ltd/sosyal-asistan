/**
 * Reklam kararı: düz kod, LLM yok, her karar nedenini kodla söyler (cümleyi `plain-language-ads.ts` kurar). Sıra (ilk eşleşen kazanır):
 * hedef yok → undecided · veri yok → insufficient_data · öğreniyor → learning · kapat → stop (sonuç kapısı: az sonuç + küçük harcamada
 * insufficient_data) · azalt → reduce · yoruldu → fatigued · artır → scale (istikrarsız / iniş sayfası şüphesi / ani kötüleşme → hold) · bekle.
 * İki mod: `value` (getiri; başabaş altı kapat, hedefin %70'i altı azalt, 1,2 katı üstü artır) ve `cost` (gelir ölçülmeyen hesap: hedef sonuç
 * maliyetine göre 2 / 1,3 / 0,8 kat). Ölçülemeyen girdi `unmeasured`'a yazılır, sessizce 0 sayılmaz.
 */
import { adConfidenceOf } from "@/lib/ads/confidence";
import { costForDecision } from "@/lib/ads/metrics";
import type { AdRules } from "@/lib/ads/rules";
import type { SeriesMeasure } from "@/lib/ads/series";
import type { AdBaseline, AdGoal, AdMetricSums, AdMetrics, AdVerdict } from "@/lib/domain/ads";

export const AD_REASON_CODES = [
  "goal_missing",
  "goal_incomplete",
  "no_spend",
  "key_unmeasured",
  "learning_days",
  "learning_results",
  "stop_below_break_even",
  "stop_cost_far_above_target",
  "stop_gate_few_results",
  "reduce_below_target",
  "reduce_cost_above_target",
  "fatigued_frequency_and_drop",
  "scale_above_target",
  "scale_cost_below_target",
  "landing_page_suspect",
  "recent_worsening",
  "unstable",
  "stability_unmeasured",
  "on_target",
] as const;
export type AdReasonCode = (typeof AD_REASON_CODES)[number];

export interface VerdictInput {
  goal?: AdGoal;
  sums: AdMetricSums;
  metrics: AdMetrics;
  baseline?: AdBaseline;
  /** Yayına gireli kaç gün (bilinmiyorsa veri olan gün sayısı). */
  ageDays: number;
  fatigue: SeriesMeasure;
  stability: SeriesMeasure;
  worsening: SeriesMeasure;
  rules: AdRules;
}

const seriesUnmeasured = (name: string, measure: SeriesMeasure): string[] => (measure.value === undefined && measure.reason !== undefined ? [`${name}:${measure.reason}`] : []);

/** Hedefin bu modda kullanılabilir olup olmadığı. */
function goalProblem(goal: AdGoal | undefined): AdReasonCode | undefined {
  if (goal === undefined) return "goal_missing";
  if (goal.kind === "value") return goal.targetReturn !== undefined && goal.targetReturn > 0 ? undefined : "goal_incomplete";
  return goal.targetCostPerResult !== undefined && goal.targetCostPerResult > 0 ? undefined : "goal_incomplete";
}

export function decideAd(input: VerdictInput): AdVerdict {
  const { goal, sums, metrics, rules } = input;
  const confidence = adConfidenceOf(sums, input.ageDays, rules);
  const make = (status: AdVerdict["status"], reasons: AdReasonCode[], unmeasured: string[] = []): AdVerdict => ({
    status,
    reasons,
    confidence,
    ...(unmeasured.length === 0 ? {} : { unmeasured }),
  });

  const problem = goalProblem(goal);
  if (problem !== undefined || goal === undefined) return make("undecided", [problem ?? "goal_missing"]);
  if (sums.spend <= 0) return make("insufficient_data", ["no_spend"]);

  const valueMode = goal.kind === "value";
  const returnOnSpend = metrics.returnOnSpend;
  const cost = costForDecision(sums, metrics);
  if (valueMode ? returnOnSpend === undefined : cost === undefined) return make("insufficient_data", ["key_unmeasured"], [valueMode ? "returnOnSpend" : "costPerResult"]);

  const learning: AdReasonCode[] = [];
  if (input.ageDays < rules.learningMinDays) learning.push("learning_days");
  // Sonuç sayısı ölçülmüyorsa (yalnız değer ölçülüyor) "az sonuç" denemez: 0 sayılmaz, ölçülemeyen olarak yazılır.
  const resultsUnmeasured = sums.results === undefined;
  if (!resultsUnmeasured && (sums.results as number) < rules.learningMinResults) learning.push("learning_results");
  if (learning.length > 0) return make("learning", learning);

  const targetReturn = goal.targetReturn ?? 0;
  const targetCost = goal.targetCostPerResult ?? 0;
  const breakEven = goal.grossMargin !== undefined && goal.grossMargin > 0 ? 1 / goal.grossMargin : rules.breakEvenReturn;
  const stopped = valueMode ? (returnOnSpend as number) < breakEven : (cost as number) > targetCost * rules.costStopAboveTargetMultiple;
  if (stopped) {
    const reference = goal.targetCostPerResult ?? input.baseline?.costPerResult;
    const tooLittle = (sums.results ?? 0) < rules.stopMinResults && (reference === undefined || sums.spend < reference * rules.stopMinSpendTargetMultiple);
    if (tooLittle) return make("insufficient_data", ["stop_gate_few_results"]);
    return make("stop", [valueMode ? "stop_below_break_even" : "stop_cost_far_above_target"]);
  }

  const reduced = valueMode ? (returnOnSpend as number) < targetReturn * rules.reduceBelowTargetShare : (cost as number) > targetCost * rules.costReduceAboveTargetMultiple;
  if (reduced) return make("reduce", [valueMode ? "reduce_below_target" : "reduce_cost_above_target"]);

  if (input.fatigue.value === true) return make("fatigued", ["fatigued_frequency_and_drop"]);

  const unmeasured = [...(resultsUnmeasured ? ["results"] : []), ...seriesUnmeasured("fatigue", input.fatigue), ...seriesUnmeasured("stability", input.stability), ...seriesUnmeasured("worsening", input.worsening)];
  const scaleUp = valueMode ? (returnOnSpend as number) >= targetReturn * rules.scaleAboveTargetMultiple : (cost as number) < targetCost * rules.costScaleBelowTargetMultiple;
  if (!scaleUp) return make("hold", ["on_target"], unmeasured);

  const holds: AdReasonCode[] = [];
  if (input.stability.value === false) holds.push("unstable");
  if (input.stability.value === undefined) holds.push("stability_unmeasured");
  if (input.worsening.value === true) holds.push("recent_worsening");
  const landing = metrics.clickRate !== undefined && metrics.clickRate > rules.landingSuspectCtr && metrics.resultRate !== undefined && metrics.resultRate < rules.landingSuspectResultRate;
  if (landing) holds.push("landing_page_suspect");
  if (holds.length > 0) return make("hold", holds, unmeasured);
  return make("scale", [valueMode ? "scale_above_target" : "scale_cost_below_target"], unmeasured);
}
