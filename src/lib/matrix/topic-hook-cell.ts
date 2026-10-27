/**
 * Konu × hook türü matrisi: TEK hücrenin ve satır toplamının hesabı (saf). Taraf özeti açı matrisiyle ORTAK `cellStat` (`groupStat` →
 * `summarizeLiftSamples`: olgunlaşmamış <3 gün lift özete girmez, güven örnek sayısı + baz çizgisi tavanıdır); kopya kural yok. Durum
 * `topicCellStatusOf` (domain). Ölçülemeyen değer `undefined`'dır (0 değil); video yoksa taraf `emptyCellStat()`, hücre `empty`.
 */
import type { ContentItem } from "@/lib/domain/content";
import { summarizeContent } from "@/lib/domain/content-summary";
import type { CreativeCellStat, CreativeMatrixSample } from "@/lib/domain/creative-matrix";
import type { HookType } from "@/lib/domain/hook-types";
import {
  TOPIC_CELL_SAMPLES_MAX,
  emptyTopicHookCell,
  topicCellStatusOf,
  type TopicHookCell,
} from "@/lib/domain/topic-hook-matrix";
import { cellStat } from "@/lib/matrix/cell";
import type { AnalysisRef } from "@/lib/insights/types";

/** Bir hücreye (ya da satıra) düşen videolar; kendi ve rakip AYRI tutulur. */
export interface TopicMembers {
  own: ContentItem[];
  rivals: ContentItem[];
}

/** Lift'e göre azalan (ölçülemeyen sonda), eşitlikte içerik kimliği: deterministik. (`cell.ts`'teki sıralamayla aynı kural.) */
function byLiftDesc(a: CreativeMatrixSample, b: CreativeMatrixSample): number {
  return (b.currentLift ?? Number.NEGATIVE_INFINITY) - (a.currentLift ?? Number.NEGATIVE_INFINITY) || (a.contentItemId < b.contentItemId ? -1 : 1);
}

/** Hücre; üye yok ya da hepsi boşsa boş hücre (durum `empty`). */
export function buildTopicCell(
  clusterKey: string,
  hookType: HookType,
  members: TopicMembers | undefined,
  analysisOf: (id: string) => AnalysisRef | undefined,
): TopicHookCell {
  if (members === undefined || members.own.length + members.rivals.length === 0) return emptyTopicHookCell(clusterKey, hookType);
  const own = cellStat(members.own);
  const rivals = cellStat(members.rivals);
  const sample = (isOwn: boolean) => (item: ContentItem): CreativeMatrixSample => ({ ...summarizeContent(item, analysisOf(item.id)), isOwn });
  return {
    clusterKey,
    hookType,
    own,
    rivals,
    ownTried: own.n > 0,
    status: topicCellStatusOf({ own, rivals }),
    samples: [...members.own.map(sample(true)), ...members.rivals.map(sample(false))].sort(byLiftDesc).slice(0, TOPIC_CELL_SAMPLES_MAX),
  };
}

/** Satır toplamı: satırdaki TÜM hook türlerinin kendi ve rakip videoları (hücre toplamlarının toplamı; her video tek hücrededir). */
export function buildRowTotals(cells: readonly TopicMembers[]): { own: CreativeCellStat; rivals: CreativeCellStat } {
  return { own: cellStat(cells.flatMap((m) => m.own)), rivals: cellStat(cells.flatMap((m) => m.rivals)) };
}
