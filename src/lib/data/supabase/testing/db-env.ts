/**
 * Entegrasyon (DB) testlerinin ortamı: yerel Supabase'e karşı koşar, açık değilse ya da anahtar yoksa ATLANIR (neden
 * test adına yazılır). `.env.local` (Next kuralı) varsa yüklenir; süreçte tanımlı değişkenlerin üzerine yazılmaz.
 * Güvenlik: varsayılan olarak yalnız yerel adreste (localhost/127.0.0.1) koşar — sözleşme süiti kayıt oluşturur/siler ve
 * cron'suz TEST workspace'i ister; uzak (gerçek) projeye yanlışlıkla yönelmesin (`ALLOW_DB_TEST_REMOTE=1` ile açılır).
 */
import { resolve } from "node:path";

export interface DbTestEnv {
  url: string;
  serviceRoleKey: string;
  /** `publish_jobs.approved_by` için yerel kullanıcı (test workspace'ine sahip üye olarak eklenir). */
  userId: string;
}

export interface DbTestStatus {
  env?: DbTestEnv;
  /** Atlama nedeni (env varsa boş). */
  skipReason?: string;
}

function loadDotEnvLocal(): void {
  try {
    process.loadEnvFile(resolve(process.cwd(), ".env.local"));
  } catch {
    // Dosya yok: süreç ortamı yeterli olabilir.
  }
}

const isLocalUrl = (url: string) => /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i.test(url);

/** Ortamı okur ve Supabase'in ayakta olup olmadığına bakar (kısa zaman aşımı). */
export async function resolveDbTestEnv(): Promise<DbTestStatus> {
  loadDotEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const userId = process.env.LOCAL_USER_ID?.trim();
  if (!serviceRoleKey) return { skipReason: "SUPABASE_SERVICE_ROLE_KEY tanımlı değil (.env.local; npm run db:status)" };
  if (!url) return { skipReason: "NEXT_PUBLIC_SUPABASE_URL tanımlı değil" };
  if (!userId) return { skipReason: "LOCAL_USER_ID tanımlı değil (supabase/seed.sql başlığı)" };
  if (!isLocalUrl(url) && process.env.ALLOW_DB_TEST_REMOTE !== "1") {
    return { skipReason: "Supabase adresi yerel değil (uzak projeye karşı koşmaz; ALLOW_DB_TEST_REMOTE=1 ile açılır)" };
  }
  try {
    const response = await fetch(`${url}/rest/v1/`, { headers: { apikey: serviceRoleKey }, signal: AbortSignal.timeout(3000) });
    if (!response.ok) return { skipReason: `Supabase yanıtı ${response.status} (npm run db:start çalışıyor mu?)` };
  } catch {
    return { skipReason: "Supabase'e ulaşılamıyor (npm run db:start ile başlat)" };
  }
  return { env: { url, serviceRoleKey, userId } };
}
