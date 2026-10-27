/**
 * Kanıtlanmış fikir kartlarının okuyucusu: girdileri depodan TEK okumayla toplar (içerik, analiz, küme, niş dışı kimlikler; her kaynak
 * bir kez, video sayısıyla büyümez: N+1 yok) ve `buildProvenIdeas`'ı çağırır. YALNIZ okur; hiçbir tabloya yazmaz. Pencere: `days` gün
 * geriye yayınlanmış kısa videolar (varsayılan 90, `GROUP_WINDOW_DAYS`).
 */
import "server-only";

import type { ContentItem } from "@/lib/domain/content";
import type { ContentAnalysis } from "@/lib/domain/intel";
import type { PanelRepository } from "@/lib/data/repository";
import { iso } from "@/lib/data/supabase/mappers/common";
import { ANALYSIS_COLUMNS, toContentAnalysis, type AnalysisRow } from "@/lib/data/supabase/mappers/intel";
import { fetchAllRows } from "@/lib/data/supabase/paging";
import { GROUP_WINDOW_DAYS } from "@/lib/insights/constants";
import { loadAllContent, loadScreens } from "@/lib/intel/content-load";
import { buildProvenIdeas, type ProvenClusterRow } from "@/lib/intel/proven-ideas";
import type { ProvenIdea } from "@/lib/intel/proven-ideas-types";
import { DAY_MS } from "@/lib/time";
import type { AdminClient } from "@/lib/supabase/admin";

/** Girdi kaynakları; her biri `loadProvenIdeas` içinde tam bir kez çağrılır (testte sahtesi verilir). */
export interface ProvenIdeasReaders {
  readContent(sinceIso: string): Promise<ContentItem[]>;
  readAnalyses(): Promise<ContentAnalysis[]>;
  readClusters(): Promise<ProvenClusterRow[]>;
  readOffNicheIds(): Promise<string[]>;
}

export interface ProvenIdeasLoad {
  ideas: ProvenIdea[];
  /** Veri durumu (RAPOR için): değerlendirilen girdilerin sayıları. */
  counts: { items: number; analyses: number; clusters: number; offNiche: number };
}

export function createProvenIdeasReaders(deps: { client: AdminClient; repo: PanelRepository; workspaceId: string }): ProvenIdeasReaders {
  const { client, repo, workspaceId } = deps;
  return {
    readContent: (since) => loadAllContent(repo, workspaceId, { format: "short_video", since }),
    readAnalyses: async () => {
      const rows = await fetchAllRows((from, to) =>
        client
          .from("content_analyses")
          .select(ANALYSIS_COLUMNS)
          .eq("workspace_id", workspaceId)
          .eq("status", "ok")
          .eq("evidence_verified", true)
          .order("id", { ascending: true })
          .range(from, to)
          .overrideTypes<AnalysisRow[], { merge: false }>(),
      );
      return rows.map(toContentAnalysis);
    },
    readClusters: async () => {
      type Row = { content_item_id: string; cluster_key: string; cluster_label: string; clustered_at: string };
      const rows = await fetchAllRows((from, to) =>
        client
          .from("content_topic_clusters")
          .select("content_item_id, cluster_key, cluster_label, clustered_at")
          .eq("workspace_id", workspaceId)
          .order("content_item_id", { ascending: true })
          .range(from, to)
          .overrideTypes<Row[], { merge: false }>(),
      );
      return rows.map((r) => ({ contentItemId: r.content_item_id, clusterKey: r.cluster_key, clusterLabel: r.cluster_label, clusteredAt: iso(r.clustered_at) }));
    },
    readOffNicheIds: async () => [...(await loadScreens(client, workspaceId))].filter(([, screen]) => !screen.inNiche).map(([id]) => id),
  };
}

export async function loadProvenIdeas(readers: ProvenIdeasReaders, options: { now: Date; days?: number }): Promise<ProvenIdeasLoad> {
  const since = new Date(options.now.getTime() - (options.days ?? GROUP_WINDOW_DAYS) * DAY_MS).toISOString();
  const [items, analyses, clusters, offNicheContentIds] = await Promise.all([
    readers.readContent(since),
    readers.readAnalyses(),
    readers.readClusters(),
    readers.readOffNicheIds(),
  ]);
  return {
    ideas: buildProvenIdeas({ items, analyses, clusters, offNicheContentIds }),
    counts: { items: items.length, analyses: analyses.length, clusters: clusters.length, offNiche: offNicheContentIds.length },
  };
}
