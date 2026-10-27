/**
 * Sözleşme süiti test verisi (Kreatif Matris): `ok` analizli içeriklere açı × katman etiketi. Satırlar yazma sözleşmesiyle
 * (`creativeLabelRowSchema`) doğrulanır. Hücre dağılımı bilerek matrisin dört kuralını sınar:
 *  - kendi ilk analizli videosu → `tried` hücresi (kendi denedi); ikincisinin etiketi KANITSIZ (`evidence_verified = false`) → hücre dolmaz;
 *  - izlenen iki rakip farklı hücrelerde, rakipte tuttu + kendi denemedi → kanıtlı fırsat (fırsat sırası ≥ 2 hücreyle sınanır);
 *  - niş dışı video ve yoksayılan (`ignored`) rakibin videosu DOĞRULANMIŞ etiketli ama matrise girmez.
 */
import type { TablesInsert } from "@/lib/supabase/database.types";
import { creativeLabelRowSchema } from "@/lib/data/creative-label-schema";
import type { CreativeAngle, FunnelStage } from "@/lib/domain/creative-matrix";
import type { SeedItem } from "@/lib/data/supabase/testing/seed-content";

type Cell = readonly [FunnelStage, CreativeAngle];

const OWN_TRIED: Cell = ["cozum-ariyor", "sonuc-kazanim"];
const OWN_UNVERIFIED: Cell = ["sorunu-biliyor", "kimlik"];
const RIVAL_CELL: Record<string, Cell> = {
  "rakip.bir": ["sorunu-biliyor", "aci-korku"],
  "rakip.iki": ["cozum-ariyor", "aci-korku"],
};
const OFF_NICHE_CELL: Cell = ["hic-farkinda-degil", "aci-korku"];
const IGNORED_CELL: Cell = ["hic-farkinda-degil", "kimlik"];

export function buildCreativeLabelRows(
  wsId: string,
  items: readonly SeedItem[],
  analysisRows: readonly TablesInsert<"content_analyses">[],
  offNicheContentIds: readonly string[],
  now: Date,
): TablesInsert<"content_creative_labels">[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const off = new Set(offNicheContentIds);
  const analyzed = analysisRows
    .filter((a) => a.status === "ok")
    .flatMap((a) => byId.get(a.content_item_id) ?? [])
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime() || (a.id < b.id ? -1 : 1));

  let ownIndex = 0;
  const rows = analyzed.flatMap((item): TablesInsert<"content_creative_labels">[] => {
    let cell: Cell | undefined;
    let verified = true;
    if (off.has(item.id)) cell = OFF_NICHE_CELL;
    else if (item.owner.kind === "own") {
      cell = ownIndex === 0 ? OWN_TRIED : OWN_UNVERIFIED;
      verified = ownIndex === 0;
      ownIndex += 1;
    } else cell = RIVAL_CELL[item.owner.handle] ?? IGNORED_CELL;
    return [
      creativeLabelRowSchema.parse({
        content_item_id: item.id,
        workspace_id: wsId,
        funnel_stage: cell[0],
        angle: cell[1],
        angle_evidence: "Sabah kahveni yanlış içiyorsun.",
        funnel_evidence: "Bunu yıllarca ben de yaptım.",
        evidence_verified: verified,
        prompt_version: "label-angles-v1",
        model: "test-model",
        labeled_at: now.toISOString(),
      }),
    ];
  });
  return rows;
}
