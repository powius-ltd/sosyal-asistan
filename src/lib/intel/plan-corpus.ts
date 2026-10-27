/**
 * Plan üretiminin LLM girdileri (saf): içerik + transcript + analiz + konu eleğinden `ContentText`/`WeekContent`/`IdeaEvidenceContent`
 * ve kümeleme öğeleri. Yalnız varolan metin taşınır (uydurma yok); transcript'i süresi dolup silinmiş içerikte konuşma metni yoktur.
 * Hook türü/metni yalnız `ok` analizden gelir (başarısız/yetersiz analizden etiket taşınmaz).
 */
import type { ContentItem } from "@/lib/domain/content";
import type { AnalysisBrief, ScreenInfo, TranscriptTexts } from "@/lib/intel/content-load";
import type { ClusterTopicsItem } from "@/lib/llm/cluster-topics";
import type { ContentText } from "@/lib/llm/content-text";
import type { IdeaEvidenceContent } from "@/lib/llm/generate-ideas-validate";
import type { WeekContent } from "@/lib/llm/synthesize-week-output";

export interface PlanSources {
  byId: ReadonlyMap<string, ContentItem>;
  transcripts: ReadonlyMap<string, TranscriptTexts>;
  analyses: ReadonlyMap<string, AnalysisBrief>;
  screens: ReadonlyMap<string, ScreenInfo>;
}

export const CLUSTER_ITEMS_MAX = 60;
export const EVIDENCE_POOL_MAX = 20;

export function contentText(item: ContentItem, src: PlanSources): ContentText {
  const transcript = src.transcripts.get(item.id);
  return { id: item.id, caption: item.caption, transcript: transcript?.speech, screenText: transcript?.screen };
}

export function weekContents(ids: readonly string[], src: PlanSources): WeekContent[] {
  return ids.flatMap((id) => {
    const item = src.byId.get(id);
    return item === undefined ? [] : [{ ...contentText(item, src), ownerHandle: item.owner.handle }];
  });
}

export function evidenceContents(ids: readonly string[], src: PlanSources): IdeaEvidenceContent[] {
  return ids.flatMap((id) => {
    const item = src.byId.get(id);
    if (item === undefined) return [];
    const analysis = src.analyses.get(id);
    const ok = analysis?.status === "ok";
    return [
      {
        ...contentText(item, src),
        ownerHandle: item.owner.handle,
        isOwn: item.owner.kind === "own",
        lift: item.score.lift,
        durationSec: item.durationSec,
        hookText: ok ? analysis?.hookText : undefined,
        hookType: ok ? analysis?.hookType : undefined,
      },
    ];
  });
}

/** Kanıt havuzu kimlikleri: sırayla birleştirilir, tekilleştirilir, `max` ile kesilir (istem boyutu sınırlı kalsın). */
export function poolIds(groups: readonly (readonly string[])[], max: number = EVIDENCE_POOL_MAX): string[] {
  const seen = new Set<string>();
  for (const group of groups) for (const id of group) if (seen.size < max) seen.add(id);
  return [...seen];
}

const byLiftDesc = (a: ContentItem, b: ContentItem): number => {
  const [x, y] = [a.score.lift, b.score.lift];
  if (x === y) return a.id.localeCompare(b.id);
  if (x === undefined) return 1;
  if (y === undefined) return -1;
  return y - x;
};

/** Kümelenecek içerikler: niş dışı olmayan, konusu/hook'u/açıklaması olan; lift azalan, en çok `CLUSTER_ITEMS_MAX`. */
export function clusterItems(items: readonly ContentItem[], src: PlanSources, offNiche: ReadonlySet<string>): ClusterTopicsItem[] {
  return items
    .filter((item) => !offNiche.has(item.id))
    .sort(byLiftDesc)
    .flatMap((item) => {
      const topic = src.screens.get(item.id)?.topic;
      const analysis = src.analyses.get(item.id);
      const hookText = analysis?.status === "ok" ? analysis.hookText : undefined;
      const caption = item.caption?.trim() ? item.caption : undefined;
      return topic === undefined && hookText === undefined && caption === undefined ? [] : [{ id: item.id, topic, hookText, caption }];
    })
    .slice(0, CLUSTER_ITEMS_MAX);
}
