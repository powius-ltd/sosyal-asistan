/**
 * Sözleşme süiti test verisi (Konu × hook matrisi): `ok` analizli içeriklere konu kümesi (`content_topic_clusters`). Dağılım bilerek matrisin
 * kurallarını sınar (seed analizleri: kendi iki video, rakip.bir ve rakip.iki birer tutan, yoksayılan rakip, niş dışı rakip videosu):
 *  - kendi en yeni analizli videosu → "Sabah rutini" (kendi denedi); ikincisi + rakip.bir'in tutan videosu → "Enerji ve dinlenme": rakipte tutup
 *    kendi denemediği hücre (kanıtlı fırsat) ve kendi-yalnız hücre;
 *  - rakip.iki'nin videosu KÜMESİZ (satır yok): `unclusteredCount`'a girer, hücreye girmez;
 *  - niş dışı video (kendi kümesi "Kahve tarifi") ve yoksayılan rakibin videosu (aynı küme "Enerji ve dinlenme") DOĞRULANMIŞ kümeli ama matrise
 *    girmez: "Kahve tarifi" satırı hiç görünmez, "Enerji ve dinlenme" hücresindeki rakip sayısı yoksayılanı içermez.
 */
import type { TablesInsert } from "@/lib/supabase/database.types";
import type { SeedItem } from "@/lib/data/supabase/testing/seed-content";

const MORNING = { key: "sabah_rutini", label: "Sabah rutini" } as const;
const ENERGY = { key: "enerji_ve_dinlenme", label: "Enerji ve dinlenme" } as const;
const COFFEE = { key: "kahve_tarifi", label: "Kahve tarifi" } as const;

export function buildTopicClusterRows(
  wsId: string,
  items: readonly SeedItem[],
  analysisRows: readonly TablesInsert<"content_analyses">[],
  offNicheContentIds: readonly string[],
  now: Date,
): TablesInsert<"content_topic_clusters">[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const off = new Set(offNicheContentIds);
  const analyzed = analysisRows
    .filter((a) => a.status === "ok")
    .flatMap((a) => byId.get(a.content_item_id) ?? [])
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime() || (a.id < b.id ? -1 : 1));

  let ownIndex = 0;
  return analyzed.flatMap((item): TablesInsert<"content_topic_clusters">[] => {
    let cluster: { key: string; label: string } | undefined;
    if (off.has(item.id)) cluster = COFFEE;
    else if (item.owner.kind === "own") {
      cluster = ownIndex === 0 ? MORNING : ENERGY;
      ownIndex += 1;
    } else if (item.owner.handle !== "rakip.iki") cluster = ENERGY;
    if (cluster === undefined) return [];
    return [
      {
        content_item_id: item.id,
        workspace_id: wsId,
        cluster_key: cluster.key,
        cluster_label: cluster.label,
        prompt_version: "cluster-topics-v1",
        model: "test-model",
        clustered_at: now.toISOString(),
      },
    ];
  });
}
