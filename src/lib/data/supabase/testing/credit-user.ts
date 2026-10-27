/**
 * Kredi testlerinin KENDİ kullanıcısı: kredi kullanıcıya aittir, bu yüzden testler yerel kullanıcının (gerçek) hesabına değil, burada açılan
 * geçici kullanıcının hesabına yazar. Kullanıcı yerel auth servisinde (admin API) açılır; temizlikte önce kredi hesabı (defteri, ayırmaları
 * ve dağılımlarıyla birlikte), sonra kullanıcı silinir. Yalnız entegrasyon (DB) testleri içe aktarır.
 *
 * Hesap silme service role'e KAPALIDIR (migration 0019): tek yol `delete_test_credit_account`'tır ve yalnız burada konan iki işareti
 * birlikte taşıyan kullanıcıda çalışır (`app_metadata.credit_test = true` + `@test.local` adresi). Gerçek hesap bu yoldan silinemez.
 */
import type { AdminClient } from "@/lib/supabase/admin";

/** Geçici test kullanıcısı açar; kimliğini döndürür. `tag` e-posta adresini koşuya özgü yapar. */
export async function createCreditTestUser(db: AdminClient, tag: string): Promise<string> {
  const created = await db.auth.admin.createUser({ email: `kredi-test-${tag}@test.local`, email_confirm: true, user_metadata: { display_name: "Kredi testi" }, app_metadata: { credit_test: true } });
  if (created.error || !created.data.user) throw new Error(`kredi test kullanıcısı açılamadı: ${created.error?.message ?? "kullanıcı dönmedi"}`);
  return created.data.user.id;
}

/** Test kullanıcısının kredi hesabını (varsa) ve kullanıcıyı siler. */
export async function deleteCreditTestUser(db: AdminClient, userId: string): Promise<void> {
  const account = await db.rpc("delete_test_credit_account", { p_owner: userId });
  if (account.error) throw new Error(`kredi test hesabı silinemedi: ${account.error.message}`);
  const removed = await db.auth.admin.deleteUser(userId);
  if (removed.error) throw new Error(`kredi test kullanıcısı silinemedi: ${removed.error.message}`);
}
