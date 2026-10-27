/**
 * `PanelRepository`'nin BAŞLANGIÇ AKIŞI bölümü (plan `docs/BASLANGIC-AKISI-PLAN.md` §2): `repository.ts` 400 satır sınırında olduğu için ayrı
 * dosyadadır; `PanelRepository` bu arayüzü genişletir (sözleşme tektir). Akışın durumu SAKLANMAZ: `getOnboardingState` her çağrıda iş
 * satırlarından ve veriden türetir (`domain/onboarding.ts` `deriveOnboarding`; mock ve Supabase AYNI fonksiyon: `data/views/onboarding.ts`).
 *
 * Hesap EKLEME burada değildir (çalışma alanına özel değil): `lib/workspace/registry.ts` `createWorkspace` (kullanıcı başına aynı platform +
 * aynı kullanıcı adı ikinci kez → `already_exists`), ardından `startOnboardingProbe`. Aday rakipler mevcut metotlarla okunur / eklenir
 * (`listDiscoveryCandidates`, `addCompetitor({ status: "candidate" })`); izlemeye alma YALNIZ `startOnboardingBuild` ile ("Başlat").
 *
 * Bu dosya yalnız sıralı ajanlar tarafından değiştirilir.
 */
import type { AddOnboardingRivalInput, ConfirmOnboardingAccountInput, StartOnboardingBuildInput } from "@/lib/data/onboarding-input";
import type { Competitor } from "@/lib/domain/competitor";
import type { OnboardingState } from "@/lib/domain/onboarding";
import type { PanelJob } from "@/lib/domain/panel-job";

export interface OnboardingRepository {
  /**
   * Akışın adımı + ekranın ihtiyacı (hesap, tür, konu, en yeni başarılı bakışın çıktısı, etkin iş, aday / izlenen sayıları, kalan deneme
   * hakkı). Salt okuma; hiç başlangıç işi olmayan VERİLİ hesap `done` + `legacy` döner (akış ona dayatılmaz). İşin ilerlemesi buradan değil
   * durum ucundan okunur. Bilinmeyen workspace → `not_found`.
   */
  getOnboardingState(wsId: string): Promise<OnboardingState>;
  /**
   * "Hesaba bakış"ı sıraya yazar (`onboarding` / `probe`; onay = aşamanın SABİT tavanı, sunucu yazar). Yalnız akış bunu beklerken
   * (`next === "start_probe"`: bakış hiç başlamadı ya da durdu ve hak var), aksi `invalid_state`. Hesabın platformunun modülü yoksa
   * `invalid_state`; deneme hakkı bittiyse `invalid_state`; çalışma alanında etkin iş varsa `already_exists`; Apify harcaması kapalıysa
   * (aylık tavan 0) `invalid_input`. İşi ayrık işçi koşturur; depo iş KOŞTURMAZ.
   */
  startOnboardingProbe(wsId: string): Promise<PanelJob>;
  /**
   * "Bu sen misin?" onayı: hesap türünü (kullanıcı kararı), verildiyse konu tanımını ve onay anını yazar. Yalnız bakış başarıyla bittikten
   * sonra ve ilk tur başlamadan (`review_account` / `choose_rivals`), aksi `invalid_state`. Geçersiz tür / konu → `invalid_input`. Güncel durum döner.
   */
  confirmOnboardingAccount(wsId: string, input: ConfirmOnboardingAccountInput): Promise<OnboardingState>;
  /**
   * "Başlat": seçilen rakipleri izlemeye alır (`candidate` → `tracked`) ve ilk turu sıraya yazar (`onboarding` / `build`; onay = aşamanın
   * SABİT tavanı; hesap başına BİR KEZ). Yalnız akış bunu beklerken (`next === "start_build"`), aksi `invalid_state`. Rakipler bu çalışma
   * alanının aday ya da izlenen kayıtları ve kendi hesapla AYNI platformdan olmalı, en çok `ONBOARDING_RIVALS_MAX` (aksi `invalid_input`);
   * boş liste = rakipsiz, geçerli yol. İlk tur zaten yapıldıysa / etkin iş varsa `already_exists`. İş yazılamazsa hiçbir rakip izlemeye
   * alınmaz (onaysız izleme yok).
   */
  startOnboardingBuild(wsId: string, input?: StartOnboardingBuildInput): Promise<PanelJob>;
  /**
   * "Bildiğin bir hesabı ekle": elle yazılan hesabı YALNIZ aday olarak yazar (`candidate`, kaynak `manual`; izlemeye alma yalnız
   * `startOnboardingBuild` ile). `addCompetitor`'dan farkı: Apify profil koşusu REZERVE ETMEZ (hiçbir şey harcanmaz; profil sayıları ilk tur
   * sırasında gelir). Platform akıştaki kendi hesabın platformudur. Yalnız akış rakip seçimini beklerken (`next === "start_build"`), aksi
   * `invalid_state`; geçersiz kullanıcı adı `invalid_input`; aynı hesap zaten varsa `already_exists`.
   */
  addOnboardingRival(wsId: string, input: AddOnboardingRivalInput): Promise<Competitor>;
  /**
   * "Bu ben değilim" / "başka hesap dene": yanlış açılan çalışma alanını KALDIRIR (bağlı kayıtlarıyla). GÜVENLİ KURAL (Supabase'de DB tutar,
   * migration 0022 `discard_unconfirmed_workspace`): yalnız hesap henüz ONAYLANMAMIŞSA, ilk tur (`build`) hiç açılmamışsa, etkin iş yoksa,
   * hesaba bakıştan başka iş koşmamışsa ve gerçek veri (izlenen rakip, video incelemesi, plan, fikir, yayın işi) yoksa; aksi `invalid_state`
   * ve HİÇBİR ŞEY silinmez (gerçek veri taşıyan çalışma alanı bu yoldan silinemez). Bilinmeyen çalışma alanı `not_found`. Çağıran, silinen
   * çalışma alanı geçerli olan çalışma alanıysa başka bir çalışma alanına geçmekten sorumludur (panel: `sp_ws` çerezi silinmiş kaydı
   * kendiliğinden varsayılana düşürür). Örnek (mock) veride tek çalışma alanı vardır: kural denetlenir, çalışma alanı kalkmaz.
   */
  discardOnboardingWorkspace(wsId: string): Promise<void>;
}
