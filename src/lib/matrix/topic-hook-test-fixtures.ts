/** Yalnız testler için: konu × hook matrisi girdisi (mock depoya bağımlı olmadan). Video/analiz üretimi anatomi fixture'ını kullanır. */
import { NOW, OWN, RIVAL, video, type VideoSpec } from "@/lib/anatomy/test-fixtures";
import type { ContentItem } from "@/lib/domain/content";
import type { AnalysisRef } from "@/lib/insights/types";
import type { TopicHookInput } from "@/lib/matrix/topic-hook-build";

export interface TopicMade extends VideoSpec {
  /** Küme anahtarı; verilmezse kümesiz. */
  cluster?: string;
  /** Küme etiketi (verilmezse anahtar). */
  label?: string;
  /** Hook türü (varsayılan `question`); `null` → analizde hook türü yok. */
  hookType?: string | null;
  /** Kümelenme zamanı (ISO); satır etiketi en yeni satırdan alınır. */
  clusteredAt?: string;
}

export const AT = "2026-09-30T11:00:00.000Z";

export function topicInput(specs: TopicMade[], over: Partial<TopicHookInput> = {}): TopicHookInput {
  const items: ContentItem[] = [];
  const analyses: AnalysisRef[] = [];
  const clusters: TopicHookInput["clusters"][number][] = [];
  for (const spec of specs) {
    const { item, analysis } = video(spec);
    items.push(item);
    const hookType = spec.hookType === null ? undefined : (spec.hookType ?? "question");
    if (analysis) analyses.push({ contentItemId: item.id, status: analysis.status, evidenceVerified: analysis.evidenceVerified, hookType });
    if (spec.cluster !== undefined) {
      clusters.push({ contentItemId: item.id, clusterKey: spec.cluster, clusterLabel: spec.label ?? spec.cluster, clusteredAt: spec.clusteredAt ?? AT });
    }
  }
  return { workspaceId: "w", own: [OWN], competitors: [RIVAL], items, analyses, clusters, now: NOW, ...over };
}

/** `count` rakip videosu: aynı küme, aynı hook türü, aynı lift. */
export const rivalVideos = (count: number, cluster: string, lift: number | undefined, extra: Partial<TopicMade> = {}): TopicMade[] =>
  Array.from({ length: count }, (_, i) => ({ id: `r-${cluster}-${extra.hookType ?? "question"}-${i}-${lift}`, lift, cluster, ...extra }));

/** `count` kendi videosu: aynı küme, aynı hook türü, aynı lift. */
export const ownVideos = (count: number, cluster: string, lift: number | undefined, extra: Partial<TopicMade> = {}): TopicMade[] =>
  rivalVideos(count, cluster, lift, extra).map((spec) => ({ ...spec, id: `o-${spec.id}`, own: true }));
