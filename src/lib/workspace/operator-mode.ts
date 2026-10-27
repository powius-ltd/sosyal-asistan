/**
 * OPERATÖR MODU (giriş yok, yerel): tek operatör (kullanıcının kendisi) tüm çalışma alanlarını görür, aralarında geçiş yapar ve yenisini
 * açar. Üyelik/giriş altyapısı henüz YOK; Supabase Auth gelince aynı çalışma alanları üyeliğe bağlanacak (her yeni çalışma alanına
 * `LOCAL_USER_ID` için `owner` satırı bu yüzden yazılır) ve bu mod kaldırılır.
 *
 * GÜVENLİK: geçiş (çerez) ve oluşturma yalnız operatör modunda açıktır. Panel yanlışlıkla internete açılırsa başkası çalışma alanı
 * değiştiremesin diye mod, barındırma ortamında KAPALIDIR:
 *   - `VERCEL` tanımlıysa her zaman kapalı;
 *   - `OPERATOR_MODE=local` açık, başka her değer (`off` …) kapalı;
 *   - `OPERATOR_MODE` yoksa: yerelde (VERCEL yok) açık. `next start` (NODE_ENV=production) yerelde çalışmaya devam eder.
 * Kapalıyken yalnız `LOCAL_WORKSPACE_ID` çalışma alanı kullanılır; `sp_ws` çerezi yok sayılır.
 */

/** `OPERATOR_MODE` env değerinin "açık" karşılığı. */
export const OPERATOR_MODE = "local";

/** Geçerli çalışma alanını taşıyan çerez adı. Yalnız KİMLİK taşır; her istekte kayıtta var mı doğrulanır. */
export const WORKSPACE_COOKIE = "sp_ws";

type Env = Readonly<Record<string, string | undefined>>;

/** Çerezle geçiş ve çalışma alanı oluşturma bu ortamda açık mı? Eksik/biçimsiz değer güvenli yöne (kapalı) düşer. */
export function isOperatorMode(env: Env = process.env): boolean {
  if (env.VERCEL?.trim()) return false;
  const raw = env.OPERATOR_MODE?.trim().toLowerCase();
  if (raw === undefined || raw === "") return true;
  return raw === OPERATOR_MODE;
}
