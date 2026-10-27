/**
 * Tutan reçetesi (`AnatomyReport.recipe`): kohort başına medyan/pay + kendi ↔ tutan fark cümlesi. LLM yok, fark metni KODLA.
 *
 * Kohortlar: `winners` = lift'i ölçülmüş (olgun) ve ≥ `winnerMinLift` olan analizli videolar (kendi + rakip) · `other_rivals` = lift'i
 * ölçülmüş ve eşiğin altında kalan rakip videoları (lift'i ölçülemeyen video "tutmadı" sayılmaz, kohorta girmez) · `own` = tüm kendi
 * analizli videolar (kendi tutanlar dahil; `winners` ile örtüşebilir). Kohort metriği ölçülmüş örnek n < 3 ise `undefined` + sebep
 * (0 değil). Güven `summarizeLiftSamples` (tek kural: örnek sayısı + baz çizgisi tavanı).
 */
import { formatRecipeValue } from "@/lib/anatomy/format";
import { RECIPE_COHORT_PLAIN, RECIPE_METRIC_PLAIN } from "@/lib/anatomy/plain";
import {
  RECIPE_COHORTS,
  type AnatomyReport,
  type AnatomyScope,
  type CtaPosition,
  type RecipeCohort,
  type RecipeCohortKey,
  type RecipeDifference,
  type RecipeMetric,
  type RecipeValue,
  type VideoAnatomy,
} from "@/lib/domain/anatomy";
import type { ContentItem } from "@/lib/domain/content";
import { CONFIDENCE_LEVELS, type ConfidenceLevel } from "@/lib/domain/weekly-plan";
import { usableLift } from "@/lib/data/views/insights-groups";
import { summarizeLiftSamples } from "@/lib/metrics/hook-lift";
import { mean, median } from "@/lib/metrics/stats";

/** Bir analizli video: içerik (lift/skor için) + türetilmiş anatomisi. */
export interface AnatomyEntry {
  item: ContentItem;
  anatomy: VideoAnatomy;
}

/** Kohort metriğinin dayandığı en az ölçülmüş video sayısı (altında `undefined` + sebep). */
export const MIN_RECIPE_N = 3;

type Pick1 = (a: VideoAnatomy) => number | undefined;

interface MetricSpec {
  /** Videodan değer (pay metriklerinde 0/1); ölçülemiyorsa undefined. */
  pick: Pick1;
  /** Pay (0..1, ortalama) mi, medyan mı. */
  share: boolean;
  /** Sebep metninde "… ölçülmüş video yok". */
  what: string;
}

const sectionCountOf = (a: VideoAnatomy) => (a.phases.length === 0 ? undefined : a.phases.reduce((sum, p) => sum + p.sections.length, 0));
const hasCta = (a: VideoAnatomy) => (a.phases.length === 0 ? undefined : a.phases.some((p) => p.phase === "cta") ? 1 : 0);

const SPECS: Record<RecipeMetric, MetricSpec> = {
  hookWords: { pick: (a) => a.hookWords, share: false, what: "açılış cümlesi" },
  firstSectionSec: { pick: (a) => a.firstSectionAtSec, share: false, what: "ilk bölüme geçiş zamanı" },
  durationSec: { pick: (a) => a.durationSec, share: false, what: "süre" },
  sectionCount: { pick: sectionCountOf, share: false, what: "bölüm" },
  cutsPerMinute: { pick: (a) => a.editMetrics?.cutsPerMinute, share: false, what: "kesme/dk" },
  screenTextCount: { pick: (a) => a.editMetrics?.onScreenTextCount, share: false, what: "ekran yazısı sayısı" },
  onCameraShare: {
    pick: (a) => (a.editMetrics?.onCameraSpeaker === undefined ? undefined : a.editMetrics.onCameraSpeaker ? 1 : 0),
    share: true,
    what: "kamerada konuşmacı bilgisi",
  },
  ctaShare: { pick: hasCta, share: true, what: "bölüm bilgisi" },
};

const METRICS = Object.keys(SPECS) as RecipeMetric[];

/** Ölçülmüş değerlerden kohort değeri: n < `MIN_RECIPE_N` → undefined + sebep. */
function recipeValue(values: readonly number[], cohortSize: number, what: string, share: boolean): RecipeValue {
  const n = values.length;
  if (n >= MIN_RECIPE_N) return { n, value: share ? mean(values) : median(values) };
  if (cohortSize === 0) return { n, reason: "Bu grupta incelenmiş video yok." };
  if (n === 0) return { n, reason: `Bu grupta ${what} ölçülmüş video yok.` };
  return { n, reason: `${what[0].toLocaleUpperCase("tr-TR")}${what.slice(1)} yalnız ${n} videoda ölçülebildi; en az ${MIN_RECIPE_N} gerekir.` };
}

const defined = (values: readonly (number | undefined)[]): number[] => values.filter((v): v is number => v !== undefined);

/** Gövdede görülen bölüm tipleri (tüm kohortlarda aynı sütunlar için), ilk görülme sırasıyla. */
function bodyTypesOf(entries: readonly AnatomyEntry[]): string[] {
  return [...new Set(entries.flatMap((e) => e.anatomy.bodyTypes))];
}

function membersOf(key: RecipeCohortKey, entries: readonly AnatomyEntry[], winnerMinLift: number): AnatomyEntry[] {
  return entries.filter(({ item, anatomy }) => {
    const lift = usableLift(item);
    if (key === "own") return anatomy.isOwn;
    if (key === "winners") return lift !== undefined && lift >= winnerMinLift;
    return !anatomy.isOwn && lift !== undefined && lift < winnerMinLift;
  });
}

function buildCohort(key: RecipeCohortKey, members: readonly AnatomyEntry[], bodyTypes: readonly string[]): RecipeCohort {
  const summary = summarizeLiftSamples(members.map(({ item }) => ({ lift: usableLift(item), lowBaseline: item.score.lowConfidence })));
  const metrics = Object.fromEntries(
    METRICS.map((metric) => {
      const spec = SPECS[metric];
      return [metric, recipeValue(defined(members.map((m) => spec.pick(m.anatomy))), members.length, spec.what, spec.share)];
    }),
  ) as Record<RecipeMetric, RecipeValue>;

  // Gövde tipi payı: paydada bölümleri bilinen (faz çizelgesi olan) videolar.
  const withPhases = members.filter((m) => m.anatomy.phases.length > 0);
  const bodyShares = Object.fromEntries(
    bodyTypes.map((type) => [type, recipeValue(withPhases.map((m) => (m.anatomy.bodyTypes.includes(type) ? 1 : 0)), members.length, "bölüm tipi", true)]),
  );

  const ctaPositionCounts: Partial<Record<CtaPosition, number>> = {};
  for (const { anatomy } of members) {
    if (anatomy.ctaPosition !== undefined) ctaPositionCounts[anatomy.ctaPosition] = (ctaPositionCounts[anatomy.ctaPosition] ?? 0) + 1;
  }
  return {
    key,
    label: RECIPE_COHORT_PLAIN[key],
    videoCount: members.length,
    confidence: summary.confidence,
    lowBaselineShare: summary.lowBaselineShare,
    metrics,
    bodyShares,
    ctaPositionCounts,
  };
}

/** İki güvenin zayıfı (`high` < `medium` < `low` sırasında daha geride olan). */
function weaker(a: ConfidenceLevel, b: ConfidenceLevel): ConfidenceLevel {
  return CONFIDENCE_LEVELS.indexOf(a) >= CONFIDENCE_LEVELS.indexOf(b) ? a : b;
}

function difference(metric: RecipeMetric, own: RecipeCohort, winners: RecipeCohort, ownLabel: string): RecipeDifference {
  const ownValue = own.metrics[metric];
  const winnersValue = winners.metrics[metric];
  const base = { metric, label: RECIPE_METRIC_PLAIN[metric], ownValue: ownValue.value, winnersValue: winnersValue.value, confidence: weaker(own.confidence, winners.confidence) };
  if (ownValue.value !== undefined && winnersValue.value !== undefined) {
    return { ...base, text: `${ownLabel} ${formatRecipeValue(metric, ownValue.value)}, tutan videolar ${formatRecipeValue(metric, winnersValue.value)}` };
  }
  const reasons = [ownValue.reason && `${ownLabel}: ${ownValue.reason}`, winnersValue.reason && `Tutan videolar: ${winnersValue.reason}`].filter((r): r is string => Boolean(r));
  return { ...base, reason: reasons.join(" ") };
}

/** Reçete: üç kohort (her zaman bu sırada) + kendi ↔ tutan farkları. `entries` analizli, kapsamdaki videolardır. */
export function buildRecipe(entries: readonly AnatomyEntry[], scope: Pick<AnatomyScope, "winnerMinLift" | "ownHandles">): AnatomyReport["recipe"] {
  const bodyTypes = bodyTypesOf(entries);
  const cohorts = RECIPE_COHORTS.map((key) => buildCohort(key, membersOf(key, entries, scope.winnerMinLift), bodyTypes));
  const own = cohorts.find((c) => c.key === "own") as RecipeCohort;
  const winners = cohorts.find((c) => c.key === "winners") as RecipeCohort;
  // Tek kendi hesap varsa adıyla, yoksa genel ad (fark metni "@ad 14 sn, tutan videolar 92 sn" biçiminde).
  const ownLabel = scope.ownHandles.length === 1 ? `@${scope.ownHandles[0]}` : "Kendi videoların";
  return { cohorts, differences: METRICS.map((metric) => difference(metric, own, winners, ownLabel)) };
}
