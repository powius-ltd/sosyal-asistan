/**
 * Konu kümelerinin DB yazımı (service role; her satır açıkça `workspace_id` ile): `content_topic_clusters` (migration 0015; içerik başına TEK güncel
 * küme, yeniden kümeleme üzerine yazar). Konu × hook türü matrisi (`getTopicHookMatrix`) bunu okur. Satır yok = kümelenmedi.
 * Tablo HER ZAMAN tek bir kümeleme koşusunu taşır: kümeler her koşuda yeniden adlanır (anahtarlar koşular arasında tutmaz) ve koşu yalnız
 * ilk N içeriği gönderir; bu yüzden bu koşuda yazılmayan her satır (modelin kümeye koymadığı ya da hiç gönderilmeyen içerik) SİLİNİR —
 * matriste iki koşunun anahtarları karışmasın, bayat satır sayılmasın.
 * Saf eşleme `toClusterRows`; yazım `saveTopicClusters`.
 */
import "server-only";

import { CLUSTER_KEY_PATTERN, CLUSTER_LABEL_MAX_CHARS } from "@/lib/domain/topic-hook-matrix";
import type { TopicCluster } from "@/lib/llm/cluster-topics";
import type { AdminClient } from "@/lib/supabase/admin";

export interface ClusterWriteContext {
  workspaceId: string;
  /** Kümelemeyi üreten istem sürümü (`cluster-topics` `PROMPT_VERSION`); boş olamaz. */
  promptVersion: string;
  model?: string;
  /** Kümelemeyi üreten abonelik koşusu (`collection_runs`); yoksa NULL. */
  runId?: string;
  now: Date;
}

export interface ClusterRow {
  content_item_id: string;
  workspace_id: string;
  cluster_key: string;
  cluster_label: string;
  prompt_version: string;
  model: string | null;
  run_id: string | null;
  clustered_at: string;
}

/**
 * Kümeleri içerik başına bir satıra açar. DB kontrolleri burada da denetlenir (anahtar `^[a-z][a-z0-9_]{0,39}$`, etiket 1–80 karakter, sürüm
 * boş değil): bozuk küme sessizce yazılmaz, fırlatılır. Bir içerik birden fazla kümede görünürse ilk kümede kalır.
 */
export function toClusterRows(clusters: readonly TopicCluster[], ctx: ClusterWriteContext): ClusterRow[] {
  if (ctx.promptVersion.trim() === "") throw new Error("Konu kümesi yazılamadı: istem sürümü boş.");
  const claimed = new Set<string>();
  const rows: ClusterRow[] = [];
  for (const cluster of clusters) {
    const label = cluster.label.trim().slice(0, CLUSTER_LABEL_MAX_CHARS);
    if (!CLUSTER_KEY_PATTERN.test(cluster.key)) throw new Error(`Konu kümesi yazılamadı: geçersiz küme anahtarı "${cluster.key}".`);
    if (label === "") throw new Error(`Konu kümesi yazılamadı: "${cluster.key}" kümesinin etiketi boş.`);
    for (const contentId of cluster.contentIds) {
      if (claimed.has(contentId)) continue;
      claimed.add(contentId);
      rows.push({
        content_item_id: contentId,
        workspace_id: ctx.workspaceId,
        cluster_key: cluster.key,
        cluster_label: label,
        prompt_version: ctx.promptVersion,
        model: ctx.model ?? null,
        run_id: ctx.runId ?? null,
        clustered_at: ctx.now.toISOString(),
      });
    }
  }
  return rows;
}

export interface SaveClustersResult {
  /** Yazılan (güncellenen) içerik sayısı. */
  saved: number;
  /** Bu koşuda yazılmadığı için silinen eski satır sayısı; DB sayıyı dönmediyse undefined (0 değil). */
  cleared?: number;
}

/**
 * Kümeleri yazar (upsert, `content_item_id` anahtarı), sonra çalışma alanında bu koşuda YAZILMAYAN tüm satırları siler (tablo tek koşuyu
 * taşır). Hiç küme yoksa (model kullanılabilir küme vermedi) hiçbir şey yazılmaz ve SİLİNMEZ: başarısız kümeleme önceki tutarlı koşuyu
 * boşaltmaz.
 */
export async function saveTopicClusters(client: AdminClient, clusters: readonly TopicCluster[], ctx: ClusterWriteContext): Promise<SaveClustersResult> {
  const rows = toClusterRows(clusters, ctx);
  if (rows.length === 0) return { saved: 0, cleared: 0 };
  const { error } = await client.from("content_topic_clusters").upsert(rows, { onConflict: "content_item_id" });
  if (error) throw new Error(`Konu kümeleri yazılamadı: ${error.message}`);

  const kept = `(${rows.map((row) => `"${row.content_item_id}"`).join(",")})`;
  const stale = await client
    .from("content_topic_clusters")
    .delete({ count: "exact" })
    .eq("workspace_id", ctx.workspaceId)
    .not("content_item_id", "in", kept);
  if (stale.error) throw new Error(`Eski konu kümeleri silinemedi: ${stale.error.message}`);
  return { saved: rows.length, cleared: stale.count ?? undefined };
}
