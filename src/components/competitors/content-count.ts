import type { Competitor } from "@/lib/domain/competitor";
import { measured, unmeasured, type Measured } from "@/lib/domain/measured";

/**
 * Rakip tablosundaki "İçerik" hücresi. Gizli ya da bulunamayan hesapta içerik ALINAMAZ; "0 içerik"
 * ölçülmüş bir sonuç gibi okunurdu, bu yüzden ölçülemedi + sebep. Henüz hiç toplanmamış (`lastCollectedAt`
 * yok, içerik yok) hesap da ölçülemedi. Gerçekten toplanmış ve içeriği olmayan hesap 0 gösterir.
 */
export function contentCountCell(c: Pick<Competitor, "status" | "contentCount" | "lastCollectedAt">): Measured<number> {
  if (c.contentCount > 0) return measured(c.contentCount);
  if (c.status === "private") return unmeasured("Gizli hesap: içerik alınamaz.");
  if (c.status === "not_found") return unmeasured("Hesap bulunamadı: içerik alınamaz.");
  if (c.lastCollectedAt === undefined) return unmeasured("Henüz toplanmadı; içerik yok.");
  return measured(0);
}
