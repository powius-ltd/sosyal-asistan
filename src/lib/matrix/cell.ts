/**
 * Kreatif Matris: TEK hücrenin hesabı (saf). Hücreye düşen kendi + rakip videolarından taraf özetleri (`groupStat` → `summarizeLiftSamples`:
 * olgunlaşmamış <3 gün lift özete girmez, güven örnek sayısı + baz çizgisi tavanıdır; kopya kural yok), baskın hook türleri, örnek
 * videolar ve durum. Ölçülemeyen değer `undefined`'dır (0 değil); video yoksa taraf `emptyCellStat()`.
 */
import {
  CELL_SAMPLES_MAX,
  CELL_TOP_HOOK_TYPES_MAX,
  cellStatusOf,
  emptyCreativeCell,
  emptyCellStat,
  priorFitOf,
  type CellHookType,
  type CreativeAngle,
  type CreativeCellStat,
  type CreativeMatrixCell,
  type CreativeMatrixSample,
  type FunnelStage,
} from "@/lib/domain/creative-matrix";
import type { ContentItem } from "@/lib/domain/content";
import { summarizeContent } from "@/lib/domain/content-summary";
import { groupStat, medianUsableLift } from "@/lib/data/views/insights-groups";
import type { AnalysisRef } from "@/lib/insights/types";

/** Bir hücreye düşen videolar (kendi ve rakip AYRI tutulur). */
export interface CellMembers {
  own: ContentItem[];
  rivals: ContentItem[];
}

/** Bir tarafın özeti: `LiftGroupStat`'tan anahtarsız; video yoksa boş taraf (medyan `undefined`). */
export function cellStat(items: readonly ContentItem[]): CreativeCellStat {
  if (items.length === 0) return emptyCellStat();
  const { n, liftN, medianLift, outlierCount, medianViews, confidence, lowBaselineShare } = groupStat("cell", items);
  return { n, liftN, medianLift, outlierCount, medianViews, confidence, lowBaselineShare };
}

/** En sık hook türleri (`n` azalan, eşitlikte tür adı artan); hook türü yalnız doğrulanmış analizden gelir, analizsiz video sayılmaz. */
export function topHookTypes(items: readonly ContentItem[], analysisOf: (id: string) => AnalysisRef | undefined): CellHookType[] {
  const byType = new Map<string, ContentItem[]>();
  for (const item of items) {
    const type = analysisOf(item.id)?.hookType;
    if (type !== undefined) byType.set(type, [...(byType.get(type) ?? []), item]);
  }
  return [...byType.entries()]
    .map(([hookType, group]): CellHookType => ({ hookType, n: group.length, medianLift: medianUsableLift(group) }))
    .sort((a, b) => b.n - a.n || (a.hookType < b.hookType ? -1 : 1))
    .slice(0, CELL_TOP_HOOK_TYPES_MAX);
}

/** Lift'e göre azalan (ölçülemeyen sonda), eşitlikte içerik kimliği: deterministik. */
function byLiftDesc(a: CreativeMatrixSample, b: CreativeMatrixSample): number {
  return (b.currentLift ?? Number.NEGATIVE_INFINITY) - (a.currentLift ?? Number.NEGATIVE_INFINITY) || (a.contentItemId < b.contentItemId ? -1 : 1);
}

export function buildCell(
  angle: CreativeAngle,
  stage: FunnelStage,
  members: CellMembers | undefined,
  analysisOf: (id: string) => AnalysisRef | undefined,
): CreativeMatrixCell {
  if (members === undefined || members.own.length + members.rivals.length === 0) return emptyCreativeCell(angle, stage);
  const own = cellStat(members.own);
  const rivals = cellStat(members.rivals);
  const sample = (isOwn: boolean) => (item: ContentItem): CreativeMatrixSample => ({ ...summarizeContent(item, analysisOf(item.id)), isOwn });
  return {
    angle,
    stage,
    prior: priorFitOf(angle, stage),
    own,
    rivals,
    topHookTypes: topHookTypes([...members.own, ...members.rivals], analysisOf),
    ownTried: own.n > 0,
    status: cellStatusOf({ own, rivals }),
    samples: [...members.own.map(sample(true)), ...members.rivals.map(sample(false))].sort(byLiftDesc).slice(0, CELL_SAMPLES_MAX),
  };
}
