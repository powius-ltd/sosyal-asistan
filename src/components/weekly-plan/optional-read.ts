import { RepositoryError } from "@/lib/data";

export type OptionalRead<T> = { available: true; value: T } | { available: false; value: undefined };

/**
 * Henüz her veri kaynağında bulunmayan salt okuma (fikir ↔ Reels bağı, "Geçen hafta", ölçüm listesi): depo `not_implemented`
 * fırlatırsa ekran çökmez, boş durum gösterir (`available: false`). Başka hata (bağlantı, veri bozukluğu) yukarı gider: sessizce yutulmaz.
 */
export async function readOptional<T>(read: () => Promise<T>): Promise<OptionalRead<T>> {
  try {
    return { available: true, value: await read() };
  } catch (error) {
    if (error instanceof RepositoryError && error.code === "not_implemented") return { available: false, value: undefined };
    throw error;
  }
}
