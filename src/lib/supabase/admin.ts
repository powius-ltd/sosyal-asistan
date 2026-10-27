/**
 * Service role Supabase istemcisi — YALNIZ sunucu. RLS'yi aşar: çağıran workspace/yetki denetimini kendisi yapar
 * (her depo metodu `wsId` alır ve filtreler; bkz. `PanelRepository`). Faz 1'de tüm sunucu tarafı veri erişimi
 * (`lib/data/supabase/**`, `lib/collection/**`) bunu kullanır; giriş ekranı (F3.5) gelince kullanıcı oturumlu
 * istemci (`@supabase/ssr`) eklenir, bu istemci yalnız sistem işleri (cron, ingest, bütçe rezervasyonu) için kalır.
 *
 * Anahtar ASLA istemciye gitmez: `import "server-only"` bu modülü bileşen paketine sokmaz; hata iletileri anahtar
 * DEĞERİ içermez (yalnız değişken adı).
 *
 * Env: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (lokal değerler: `npm run db:status`).
 */
import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export type AdminClient = SupabaseClient<Database>;

/** Yeni service role istemcisi. Oturum saklamaz/yenilemez (sunucu süreci; çerez yok). */
export function createAdminClient(): AdminClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  const missing = [
    !url && "NEXT_PUBLIC_SUPABASE_URL",
    !serviceRoleKey && "SUPABASE_SERVICE_ROLE_KEY",
  ].filter((name): name is string => Boolean(name));
  if (!url || !serviceRoleKey) {
    throw new Error(
      `Supabase service role istemcisi için env eksik: ${missing.join(", ")} (.env.local; lokal değerler: npm run db:status).`,
    );
  }

  return createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

let cached: AdminClient | undefined;

/** Süreç boyunca tek örnek (sunucu bileşenleri, action'lar ve route handler'lar bunu kullanır). */
export function getAdminClient(): AdminClient {
  cached ??= createAdminClient();
  return cached;
}
