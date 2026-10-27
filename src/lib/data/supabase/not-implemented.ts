/**
 * SAPLAMA yardımcısı: henüz uygulanmamış depo metodu (`not_implemented`). Uygulayan paket stub'ı gerçek işlevle değiştirir ve
 * bu yardımcıyı kullanmaz hale getirir; hiç stub kalmayınca dosya silinir. Sözleşme süiti `pending` ile bu durumu tolere eder
 * (bkz. `RepositoryContractOptions.pending`).
 */
import { RepositoryError, type PanelRepository } from "@/lib/data/repository";
import type { SupabaseContext } from "@/lib/data/supabase/context";

/** `PanelRepository[K]` ile aynı imza, başına `ctx` (deponun diğer modülleriyle aynı biçim). */
export type SupabaseMethod<K extends keyof PanelRepository> = (
  ctx: SupabaseContext,
  ...args: Parameters<PanelRepository[K]>
) => ReturnType<PanelRepository[K]>;

/** Saplama: çağrılınca `RepositoryError("not_implemented")` fırlatan (reddedilen Promise döndüren) metot. */
export function notImplemented<K extends keyof PanelRepository>(what: string): SupabaseMethod<K> {
  const stub = async (): Promise<never> => {
    throw new RepositoryError("not_implemented", `${what} Supabase deposunda henüz yok.`);
  };
  return stub as unknown as SupabaseMethod<K>;
}
