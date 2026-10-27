/**
 * Viral av konu kaynakları (yalnız okuma): çalışma alanının niş özeti, kendi içeriğinin konu kümeleri ve etiketleri.
 * "Kendi tutan" = kendi hesabın içeriği (rakip içeriği değil). Konu kümesi / etiket yoksa ilgili liste boş döner.
 */
import "server-only";

import type { AdminClient } from "@/lib/supabase/admin";
import type { ViralQuerySources } from "@/lib/viral/queries";

/** Kendi içerikten bakılan son içerik sayısı. */
const OWN_CONTENT_WINDOW = 200;

const fail = (what: string, message: string): never => {
  throw new Error(`Viral av: ${what} (${message}).`);
};

export async function loadViralSources(client: AdminClient, workspaceId: string): Promise<Omit<ViralQuerySources, "manual">> {
  const workspace = await client.from("workspaces").select("niche_brief").eq("id", workspaceId).maybeSingle();
  if (workspace.error) fail("çalışma alanı okunamadı", workspace.error.message);

  const content = await client
    .from("content_items")
    .select("id, hashtags")
    .eq("workspace_id", workspaceId)
    .not("social_account_id", "is", null)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(OWN_CONTENT_WINDOW);
  if (content.error) fail("kendi içerikler okunamadı", content.error.message);
  const own = content.data ?? [];

  const counts = new Map<string, number>();
  if (own.length > 0) {
    const clusters = await client.from("content_topic_clusters").select("cluster_label").eq("workspace_id", workspaceId).in("content_item_id", own.map((row) => row.id));
    if (clusters.error) fail("konu kümeleri okunamadı", clusters.error.message);
    for (const row of clusters.data ?? []) counts.set(row.cluster_label, (counts.get(row.cluster_label) ?? 0) + 1);
  }

  return {
    nicheBrief: workspace.data?.niche_brief ?? null,
    clusters: [...counts.entries()].map(([label, count]) => ({ label, count })),
    hashtags: own.map((row) => row.hashtags ?? []),
  };
}
