/**
 * Reklam kreatiflerini matris hücrelerine dağıtan saf toplayıcı. Hücre çözümü kreatif başına: kendi içeriğine bağlıysa o içeriğin
 * doğrulanmış etiketi → yoksa etiketsiz (hücreye girmez). Reklam girdisi varsa 20 hücrenin
 * hepsine bir `AdCellStat` döner (kreatifsiz hücre `emptyAdCellStat()`); `judged = worked + fatigued + weak`; ölçülemeyen değer `undefined`.
 */
import {
  AD_CELL_SAMPLES_MAX,
  DEFAULT_AD_RULES,
  adRefOf,
  emptyAdCellStat,
  type AdCellStat,
  type AdCreativeOutcome,
  type AdMatrixSource,
  type AdMoney,
  type AdOutcome,
} from "@/lib/domain/ads";
import { CONFIDENCE_RANK, type CreativeAngle, type FunnelStage } from "@/lib/domain/creative-matrix";
import type { ConfidenceLevel } from "@/lib/domain/weekly-plan";
import { median } from "@/lib/metrics/stats";

export const adCellKey = (stage: FunnelStage, angle: CreativeAngle): string => `${stage}|${angle}`;

/** Kendi içeriğinin doğrulanmış etiketi ve (varsa) analizinin açılış türü; etiket yoksa undefined. */
export interface ContentCellInfo {
  stage: FunnelStage;
  angle: CreativeAngle;
  hookType?: string;
}

interface Placed {
  creative: AdCreativeOutcome;
  key: string;
  hookType?: string;
}

/** Kreatifin hücresi; çözülemezse undefined (etiketsiz). */
function place(creative: AdCreativeOutcome, contentCell: (contentId: string) => ContentCellInfo | undefined): Placed | undefined {
  const own = creative.sourceContentId === undefined ? undefined : contentCell(creative.sourceContentId);
  if (own === undefined) return undefined;
  return { creative, key: adCellKey(own.stage, own.angle), hookType: own.hookType };
}

const OUTCOME_ORDER: Record<AdOutcome, number> = { worked: 0, fatigued: 1, weak: 2, unjudged: 3 };

function sumMoney(items: readonly (AdMoney | undefined)[]): AdMoney | undefined {
  const known = items.filter((m): m is AdMoney => m !== undefined);
  const first = known[0];
  if (first === undefined || known.some((m) => m.currency !== first.currency)) return undefined;
  return { amount: known.reduce((sum, m) => sum + m.amount, 0), currency: first.currency };
}

function weakestConfidence(levels: readonly ConfidenceLevel[]): ConfidenceLevel {
  return levels.reduce<ConfidenceLevel>((acc, l) => (CONFIDENCE_RANK[l] < CONFIDENCE_RANK[acc] ? l : acc), "high");
}

function statOf(placed: readonly Placed[]): AdCellStat {
  if (placed.length === 0) return emptyAdCellStat();
  const count = (o: AdOutcome) => placed.filter((p) => p.creative.outcome === o).length;
  const worked = count("worked");
  const fatigued = count("fatigued");
  const weak = count("weak");
  const judged = worked + fatigued + weak;
  const judgedItems = placed.filter((p) => p.creative.outcome !== "unjudged").map((p) => p.creative);
  const samples = [...placed]
    .sort((a, b) => OUTCOME_ORDER[a.creative.outcome] - OUTCOME_ORDER[b.creative.outcome] || (a.creative.adId < b.creative.adId ? -1 : 1))
    .slice(0, AD_CELL_SAMPLES_MAX)
    .map(({ creative, hookType }) => ({
      adRef: adRefOf(creative.adId),
      name: creative.name,
      outcome: creative.outcome,
      hookType,
      sourceContentId: creative.sourceContentId,
      costVsBaseline: creative.costVsBaseline,
      returnVsBaseline: creative.returnVsBaseline,
    }));
  return {
    creatives: placed.length,
    judged,
    worked,
    fatigued,
    weak,
    confidence: judged < DEFAULT_AD_RULES.cellMinJudgedForConfidence ? "low" : weakestConfidence(judgedItems.map((c) => c.confidence)),
    spend: sumMoney(placed.map((p) => p.creative.spend)),
    costVsBaseline: median(judgedItems.flatMap((c) => c.costVsBaseline ?? [])),
    returnVsBaseline: median(judgedItems.flatMap((c) => c.returnVsBaseline ?? [])),
    samples,
  };
}

/** Hücre anahtarı (`adCellKey`) → reklam tarafı. Yalnız kreatifi olan hücreler haritada; kalanı çağıran `emptyAdCellStat()` ile doldurur. */
export function buildAdCellStats(
  source: AdMatrixSource,
  contentCell: (contentId: string) => ContentCellInfo | undefined,
): { cells: Map<string, AdCellStat>; unlabeled: number } {
  const byKey = new Map<string, Placed[]>();
  let unlabeled = 0;
  for (const creative of source.creatives) {
    const placed = place(creative, contentCell);
    if (placed === undefined) {
      unlabeled += 1;
      continue;
    }
    byKey.set(placed.key, [...(byKey.get(placed.key) ?? []), placed]);
  }
  return { cells: new Map([...byKey].map(([key, list]) => [key, statOf(list)])), unlabeled };
}
