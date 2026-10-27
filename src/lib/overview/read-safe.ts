import { RepositoryError } from "@/lib/data/repository";

/**
 * Genel bakışın tek tek okumaları: biri fırlatırsa yalnız ilgili parça düşer (`undefined`), sayfa çökmez. `not_implemented`
 * (özelliği olmayan veri kaynağı) sessiz geçilir; başka hata günlüğe yazılır ama yutulur. `null` sonuç (kayıt yok) aynen döner:
 * "yok" ile "okunamadı" ayrı kalır.
 */
export async function readSafe<T>(label: string, read: () => Promise<T>): Promise<T | undefined> {
  try {
    return await read();
  } catch (error) {
    if (!(error instanceof RepositoryError && error.code === "not_implemented")) {
      console.error(`[genel-bakis] ${label} okunamadı`, error);
    }
    return undefined;
  }
}
