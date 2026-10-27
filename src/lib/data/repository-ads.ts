/**
 * `PanelRepository`'nin REKLAM bölümü (plan `docs/REKLAM-MODUL-PLAN.md` §7): `repository.ts` 400 satır sınırında olduğu için ayrı dosyadadır;
 * `PanelRepository` bu arayüzü genişletir (sözleşme tektir). v1 YALNIZ OKUR: reklam hesabına yazan metot yoktur ve eklenmez; hesap /
 * yapı / ölçü satırlarını `ads_sync` işi sunucuda yazar (R2). Hesap tek saf fonksiyondur (`data/views/ads.ts`; mock ve Supabase AYNI).
 *
 * Her metot `wsId` alır. Zaman `now` ile verilir (depo saat okumaz). Farklı para birimli hesapların toplamları BİRLEŞTİRİLMEZ: rapor her
 * zaman TEK hesabındır. Bu dosya yalnız sıralı ajanlar tarafından değiştirilir.
 */
import type { AdDetailQuery, AdGoalPatch, AdReportQuery } from "@/lib/data/ad-schema";
import type { AdAccount, AdDetail, AdReport, AdUsage } from "@/lib/domain/ads";

export interface AdsRepository {
  /** Çalışma alanının reklam hesapları (hesap adına, sonra kimliğe göre). Hesap yoksa BOŞ liste (hata değil). */
  listAdAccounts(wsId: string): Promise<AdAccount[]>;
  /**
   * Bir hesabın dönem raporu (toplamlar, reklam başına ölçüler, alışılmışa göre oran, karar). Hesap yoksa `undefined` (hata değil: ekran
   * "reklam hesabı bağlı değil" der); verilen `accountId` bu çalışma alanında yoksa `not_found`. Dönem `days` gün (varsayılan 28), `now`
   * günü dahil. Karar kuralları R1'de gelir; o zamana dek her reklamın kararı `undecided`'dır. Geçersiz girdi → `invalid_input`.
   */
  getAdReport(wsId: string, query: AdReportQuery, now: Date): Promise<AdReport | undefined>;
  /** Tek reklamın ayrıntısı (günlük seri dahil). Reklam bu çalışma alanında yoksa `not_found`. */
  getAdDetail(wsId: string, adId: string, query: AdDetailQuery, now: Date): Promise<AdDetail>;
  /**
   * İçeriklerin reklamdaki durumu. Satır YALNIZ içerik en az bir reklam kreatifine bağlıysa vardır ("denenmedi" yokluktan okunur); bağlı
   * olmayan ya da bu çalışma alanında olmayan içerik için satır dönmez. Çalışma alanındaki TÜM hesaplara bakar.
   */
  listAdUsage(wsId: string, contentIds: readonly string[], now: Date): Promise<AdUsage[]>;
  /**
   * Hesabın hedefini yazar (`goal: null` kaldırır). YALNIZ `ad_accounts` hedef sütunları değişir: reklam hesabına (sağlayıcıya) hiçbir şey
   * gitmez. Hesap bu çalışma alanında yoksa `not_found`; hedef biçimi bozuksa `invalid_input`. Güncel hesabı döner.
   */
  updateAdAccountGoal(wsId: string, patch: AdGoalPatch): Promise<AdAccount>;
}
