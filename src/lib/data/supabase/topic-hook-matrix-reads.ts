/**
 * Konu × hook türü matrisinin girdi okuması (Supabase): `content_topic_clusters` — içerik başına tek güncel küme (PK `content_item_id`), tek
 * (sayfalı) sorgu, `workspace_id` süzgeçli. Hesap `lib/matrix`'tedir; burada yalnız satır → girdi eşlemesi var. Satır yok = kümelenmedi (hücreye
 * düşmez, `unclusteredCount`'a sayılır). Biçimi bozuk anahtar (DB check'i bunu engeller, yine de) tüm matrisi düşürmez, atlanır.
 */
import { CLUSTER_KEY_PATTERN } from "@/lib/domain/topic-hook-matrix";
import type { SupabaseContext } from "@/lib/data/supabase/context";
import { iso } from "@/lib/data/supabase/mappers/common";
import { fetchAllRows } from "@/lib/data/supabase/paging";
import type { TopicClusterAssignment } from "@/lib/matrix/topic-hook-build";

interface ClusterRow {
  content_item_id: string;
  cluster_key: string;
  cluster_label: string;
  clustered_at: string;
}

export async function readTopicClusters(ctx: SupabaseContext, wsId: string): Promise<TopicClusterAssignment[]> {
  const rows = await fetchAllRows((from, to) =>
    ctx.db
      .from("content_topic_clusters")
      .select("content_item_id, cluster_key, cluster_label, clustered_at")
      .eq("workspace_id", wsId)
      .order("content_item_id", { ascending: true })
      .range(from, to)
      .overrideTypes<ClusterRow[], { merge: false }>(),
  );
  return rows
    .filter((row) => CLUSTER_KEY_PATTERN.test(row.cluster_key))
    .map((row) => ({ contentItemId: row.content_item_id, clusterKey: row.cluster_key, clusterLabel: row.cluster_label, clusteredAt: iso(row.clustered_at) }));
}
