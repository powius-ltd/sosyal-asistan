/**
 * `PanelRepository` — panelin TEK veri sözleşmesi.
 *
 * Ekranlar/aksiyonlar veriyi YALNIZ `getRepository()` (`@/lib/data`) üzerinden alır; mock ya da
 * Supabase uygulamasını doğrudan import etmez (sınır grep'i: `@/lib/data/mock` → src/app ve
 * src/components'te 0 sonuç). Uygulamalar: `mock/**` (Faz 0) ve `supabase/**` (Faz 1).
 *
 * Kurallar:
 *  - HER metot `wsId` alır. Uygulama başka workspace'in kaydını asla döndürmez/yazmaz
 *    (Supabase'de RLS, mock'ta kontrol). Bilinmeyen wsId → liste döndüren okumada boş liste,
 *    tekil okumada (`getWorkspace`, `getContent`, `getIdea`) null; nesne döndüren özet okumalarda
 *    (`getOverview`, `getCostSummary`, `countIdeasByStatus`, `getPublishSummary`) ve tüm yazmalarda
 *    `RepositoryError("not_found")`.
 *  - "Bulunamadı" okumada `null`, yazmada `RepositoryError("not_found")`.
 *  - Ölçülemeyen değer `undefined`'dır, 0 DEĞİL (bkz. domain/measured.ts).
 *  - Mutasyonlar sunucuda doğrulanır (durum geçişi, tavan); çağıran istemciye güvenilmez.
 *  - Zaman damgaları ISO 8601 (UTC) dizgesidir; gösterim `lib/format.ts` ile Europe/Istanbul.
 *
 * Bu dosya yalnız sıralı ajanlar tarafından değiştirilir. Paralel ajan değişiklik isterse raporuna yazar.
 */
import type { AnatomyReport } from "@/lib/domain/anatomy";
import type { Briefing } from "@/lib/domain/briefing";
import type { Collection, CollectionDetail, CollectionItem } from "@/lib/domain/collection";
import type { ComplianceResult } from "@/lib/domain/compliance";
import type { Connections } from "@/lib/domain/connection";
import type { CreativeMatrix } from "@/lib/domain/creative-matrix";
import type { CreditBalance, CreditEntry, CreditHold } from "@/lib/domain/credits";
import type { Competitor, DiscoveryCandidateView, OwnAccount } from "@/lib/domain/competitor";
import type { ContentDetail, ContentItem } from "@/lib/domain/content";
import type { HookLibraryEntry, HookTypeStat } from "@/lib/domain/hook-library";
import type { Insights } from "@/lib/domain/insights";
import type { Idea, IdeaStatus } from "@/lib/domain/intel";
import type { UnmeasuredEntry } from "@/lib/domain/measured";
import type { AlertSettings, Notification, WeeklyDigest } from "@/lib/domain/notification";
import type { IdeaLink, IdeaLinkDecision, MeasurementDue, WeekReview } from "@/lib/domain/outcomes";
import type { Overview } from "@/lib/domain/overview";
import type { PanelJob } from "@/lib/domain/panel-job";
import type { PublishJob, PublishSummary } from "@/lib/domain/publish";
import type { CollectionRun, CostSummary, Workspace } from "@/lib/domain/run";
import type { TopicHookMatrix } from "@/lib/domain/topic-hook-matrix";
import type { VoiceProfile } from "@/lib/domain/voice-profile";
import type { WeeklyPlan, WeeklyPlanSummary } from "@/lib/domain/weekly-plan";
import type { CreditEntryFilter, ReserveCreditsInput } from "@/lib/data/credit-input";
import type { IdeaRevisionInput } from "@/lib/data/idea-revision-input";
import type { ManualIdeaInput } from "@/lib/data/manual-idea-input";
import type { AdsRepository } from "@/lib/data/repository-ads";
import type { OnboardingRepository } from "@/lib/data/repository-onboarding";
import type { StudioOrdersRepository } from "@/lib/data/repository-studio-orders";
import type {
  AddCompetitorInput,
  AlertSettingsPatch,
  AnatomyQuery,
  CompetitorFilter,
  ContentFilter,
  CreateCollectionInput,
  CreatePublishJobInput,
  CreativeMatrixQuery,
  DiscoveryFilter,
  HookLibraryFilter,
  IdeaFilter,
  IdeaLinkFilter,
  InsightsQuery,
  JobFilter,
  LinkIdeaToReelInput,
  NotificationFilter,
  OutlierFilter,
  OverviewQuery,
  PagedResult,
  PublishJobFilter,
  RequestJobInput,
  RunFilter,
  TopicHookMatrixQuery,
  UserSettableCompetitorStatus,
  WeeklyPlanListQuery,
  WorkspacePatch,
} from "@/lib/data/queries";

export type RepositoryErrorCode =
  /** Kayıt yok (ya da başka workspace'te). */
  | "not_found"
  /** Durum makinesi bu geçişe izin vermiyor (ör. awaiting_approval dışında onay). */
  | "invalid_state"
  /** Girdi doğrulamadan geçmedi. */
  | "invalid_input"
  /** Aynı kayıt zaten var (ör. aynı platform+handle rakip). */
  | "already_exists"
  /** Aylık bütçe tavanı aşılırdı; iş başlatılmadı. */
  | "budget_exceeded"
  /** Kredi yetmedi; ayırma yapılmadı (`InsufficientCreditsError`: istenen + harcanabilir). */
  | "insufficient_credits"
  /** Bu uygulama/özellik henüz yok. */
  | "not_implemented";

export class RepositoryError extends Error {
  readonly code: RepositoryErrorCode;

  constructor(code: RepositoryErrorCode, message: string) {
    super(message);
    this.name = "RepositoryError";
    this.code = code;
  }
}

/**
 * Uyum denetimi (`lib/compliance`) `fail` verdi: onaya gönderme/onay engellendi. Kodu `invalid_state`, mesajı
 * kullanıcıya gösterilebilir Türkçe metindir (`toActionError` bunu olduğu gibi iletir); `result` bulguları taşır.
 * İnsan onayı `fail`'i atlayamaz: depo her uygulamada aynı korumayı (`lib/data/compliance-guard.ts`) çağırır.
 */
export class ComplianceFailedError extends RepositoryError {
  readonly result: ComplianceResult;

  constructor(message: string, result: ComplianceResult) {
    super("invalid_state", message);
    this.result = result;
  }
}

/** Reklam okumaları (`listAdAccounts`, `getAdReport`, …) `repository-ads.ts`'tedir; başlangıç akışı metotları (`getOnboardingState`, `startOnboardingProbe`, …) `repository-onboarding.ts`'tedir (dosya boyu sınırı). */
export interface PanelRepository extends OnboardingRepository, AdsRepository, StudioOrdersRepository {
  // ---- Workspace + hesaplar
  getWorkspace(wsId: string): Promise<Workspace | null>;
  /**
   * Workspace ayarlarını günceller (aylık Apify/LLM tavanı, aylık ölçüm tavanı (verilmesi onaydır: `measureCapApprovedAt` o anla
   * yazılır), niş tanımı, uyum bölgesi); yalnız verilen alanlar değişir.
   * Yamayı depo da doğrular (tavan 0..1000 USD, niş ≤ 2000 karakter → `invalid_input`); değişiklik sonraki
   * bütçe kontrollerine hemen yansır. Tavan KALDIRILAMAZ (`null` geçersiz); 0 = harcama kapalı. Güncel workspace döner.
   */
  updateWorkspace(wsId: string, patch: WorkspacePatch): Promise<Workspace>;
  listOwnAccounts(wsId: string): Promise<OwnAccount[]>;
  /** Ayarlar: kendi hesap bağlantıları + entegrasyon anahtarı var/yok (değer asla dönmez). */
  getConnections(wsId: string): Promise<Connections>;

  // ---- Genel bakış
  /** `query.accountId` (kendi hesap) ya da `query.platform` ile süzülür; bilinmeyen `accountId` → `not_found`. */
  getOverview(wsId: string, query?: OverviewQuery): Promise<Overview>;

  // ---- İçerik
  listContent(wsId: string, filter?: ContentFilter): Promise<PagedResult<ContentItem>>;
  /** İçerik + snapshot serisi + baz çizgisi açıklaması + transcript + analiz. Yoksa null. */
  getContent(wsId: string, contentId: string): Promise<ContentDetail | null>;

  // ---- Rakipler + keşif
  listCompetitors(wsId: string, filter?: CompetitorFilter): Promise<Competitor[]>;
  listDiscoveryCandidates(wsId: string, filter?: DiscoveryFilter): Promise<DiscoveryCandidateView[]>;
  /** Aynı platform+handle varsa `already_exists`; tavan aşılırsa `budget_exceeded`. */
  addCompetitor(wsId: string, input: AddCompetitorInput): Promise<Competitor>;
  /** `private`/`not_found` kullanıcı tarafından set edilemez (tip düzeyinde engelli). */
  setCompetitorStatus(
    wsId: string,
    competitorId: string,
    status: UserSettableCompetitorStatus,
  ): Promise<Competitor>;

  // ---- Tutan içerikler
  /** Yalnız izlenen (`tracked`) rakiplerin içerikleri (bkz. `OutlierFilter`); `Overview.recentOutliers` aynı kümeden gelir. */
  listOutliers(wsId: string, filter?: OutlierFilter): Promise<PagedResult<ContentItem>>;

  // ---- Fikirler
  listIdeas(wsId: string, filter?: IdeaFilter): Promise<Idea[]>;
  /** Durum başına fikir sayısı (Fikirler sekme sayıları): tüm `IdeaStatus` anahtarları vardır (0 dahil), liste limitinden bağımsız. */
  countIdeasByStatus(wsId: string): Promise<Record<IdeaStatus, number>>;
  getIdea(wsId: string, ideaId: string): Promise<Idea | null>;
  updateIdeaStatus(wsId: string, ideaId: string, status: IdeaStatus): Promise<Idea>;
  /** Hook / taslak / senaryoyu yeniden yazar, eski hâli `details.revisions`'a koyar (SPN-35); yalnız new / saved / scripted fikir (`invalid_state`). */
  reviseIdea(wsId: string, ideaId: string, input: IdeaRevisionInput, now: Date): Promise<Idea>;
  /**
   * Hesap sahibinin kendi fikrini kaydeder (sohbetten): `source = manual`, `status = new`, çalışma alanının kendi hesap platformu,
   * boş hook / senaryo, kanıtsız. Girdi `manualIdeaSchema` ile doğrulanır (`invalid_input`); kendi hesap yoksa `invalid_state`;
   * son 24 saatte `MANUAL_IDEA_DAILY_MAX` elle fikir varsa `invalid_state`. Plan yeniden üretimi elle fikri silmez.
   */
  createManualIdea(wsId: string, input: ManualIdeaInput, now: Date): Promise<Idea>;

  // ---- Yayın
  listPublishJobs(wsId: string, filter?: PublishJobFilter): Promise<PublishJob[]>;
  /**
   * Yeni iş `draft` ya da `awaiting_approval` ile başlar; başka durumla oluşturulamaz. Açıklama sınırı (2200 kod
   * noktası, 30 hashtag) ve — `awaiting_approval` ile başlıyorsa — boş olmayan açıklama kuralı depoda da uygulanır
   * (`invalid_input`); yalnız bağlı (`connected`) hesaba iş açılır (`invalid_state`). Reklam veren adı ≤ 100 karakter,
   * `trial.graduation` "manual" | "performance" (`invalid_input`). `awaiting_approval` ile başlıyorsa uyum denetimi
   * (`checkCompliance`, workspace'in `complianceRegion`'ı) de uygulanır: `fail` → `ComplianceFailedError` (`invalid_state`).
   */
  createPublishJob(wsId: string, input: CreatePublishJobInput): Promise<PublishJob>;
  /**
   * Taslağı onaya gönderir: YALNIZ `draft` → `awaiting_approval` (aksi halde `invalid_state`); açıklama boşsa
   * `invalid_input` (kural depoda da); uyum denetimi `fail` ise `ComplianceFailedError` (`invalid_state`, Türkçe mesajlı;
   * `warn` engellemez). Bu bir onay DEĞİLDİR: yayın yine yalnız insan onayıyla (`approvePublishJob`) başlar.
   */
  submitPublishJob(wsId: string, jobId: string): Promise<PublishJob>;
  /**
   * YALNIZ `awaiting_approval` → `approved`; aksi halde `invalid_state`. Onaylayan = oturumdaki kullanıcı:
   * `approvedBy` (kullanıcı kimliği) ve `approvedAt` birlikte yazılır. Onay anında uyum denetimi yeniden çalışır (bölge
   * sonradan değişmiş olabilir): `fail` → `ComplianceFailedError` (`invalid_state`), iş `awaiting_approval`'da kalır —
   * insan onayı `fail`'i atlayamaz.
   */
  approvePublishJob(wsId: string, jobId: string): Promise<PublishJob>;
  /** Yayın başlamadan iptal (`canCancel`); aksi halde `invalid_state`. */
  cancelPublishJob(wsId: string, jobId: string): Promise<PublishJob>;
  /**
   * Yayın ekranı özeti: onay bekleyen sayısı + hesap başına son 24 saatte yayınlanan iş sayısı (kota). `now`
   * çağıranın tek saatidir (`getPanelContext().now`). Sayım depoda yapılır; iş listesindeki limite (200) bağlı değildir.
   */
  getPublishSummary(wsId: string, now: Date): Promise<PublishSummary>;

  // ---- Koleksiyonlar ("Kaydet" / swipe file)
  /** En son güncellenen önce (`updatedAt`); `itemCount` üyelerin sayısıdır (boş koleksiyon 0). */
  listCollections(wsId: string): Promise<Collection[]>;
  /** Koleksiyon + öğeleri (yeniden eskiye, içerik özetiyle: içerik başına okuma gerekmez). Yoksa null. */
  getCollection(wsId: string, collectionId: string): Promise<CollectionDetail | null>;
  /** Ad workspace içinde benzersiz (Türkçe İ/ı ve büyük-küçük harf duyarsız) → `already_exists`; geçersiz ad/açıklama → `invalid_input`. */
  createCollection(wsId: string, input: CreateCollectionInput): Promise<Collection>;
  /** Kendi adına (harf büyüklüğü dahil) yeniden adlandırmak serbesttir; başka koleksiyonun adı → `already_exists`. */
  renameCollection(wsId: string, collectionId: string, name: string): Promise<Collection>;
  /** Koleksiyonu ve üyeliklerini siler (içerikler silinmez). Yoksa `not_found`. */
  deleteCollection(wsId: string, collectionId: string): Promise<void>;
  /**
   * İçeriği koleksiyona ekler. İDEMPOTENT: zaten üyeyse yeni kayıt açılmaz (`addedAt` korunur); `note` verilirse notu
   * günceller ("" siler), verilmezse dokunmaz. Koleksiyon ya da içerik yoksa `not_found`; not ≤ 500 karakter (`invalid_input`).
   */
  addToCollection(wsId: string, collectionId: string, contentId: string, note?: string): Promise<CollectionItem>;
  /** İçeriği koleksiyondan çıkarır. İdempotent: üye değilse sessizce döner; koleksiyon yoksa `not_found`. */
  removeFromCollection(wsId: string, collectionId: string, contentId: string): Promise<void>;
  /** İçerik hangi koleksiyonlarda (en son güncellenen önce). Bilinmeyen içerik/workspace → boş liste. */
  listCollectionsForContent(wsId: string, contentId: string): Promise<Collection[]>;
  /**
   * Toplu üyelik: bir sayfadaki içeriklerin hangi koleksiyonlarda olduğu TEK okumayla (kart/tablo başına okuma yok:
   * "Kaydet" düğmesinin ilk durumu için). Sonuç, istenen HER içerik kimliğini anahtar olarak içerir; üye olmayan (ya da
   * bilinmeyen) içerik `[]` alır, kimlikler tekrarlıysa tek anahtar. Değerler koleksiyon kimlikleridir, en son güncellenen
   * koleksiyon önce (`listCollectionsForContent` ile aynı sıra). Bilinmeyen workspace → her kimlik `[]`. Boş liste → `{}`.
   * Kimlikler metin olmalı ve en çok `COLLECTION_MEMBERSHIP_IDS_MAX` (200) tane olabilir, aksi `invalid_input`.
   */
  listCollectionMembership(wsId: string, contentIds: string[]): Promise<Record<string, string[]>>;

  // ---- Hook kütüphanesi (analizlerden türetilen görünüm; iskelet, dolum F2)
  /**
   * `ok` ve kanıtı doğrulanmış analizlerin hook'ları (kendi hesap + izlenen rakipler); filtre/sıralama `HookLibraryFilter`.
   * `total` filtreye uyan giriş sayısıdır. Analiz yoksa boş liste (hata değil).
   */
  listHookLibrary(wsId: string, filter?: HookLibraryFilter): Promise<PagedResult<HookLibraryEntry>>;
  /**
   * Hook türü başına giriş sayısı ve medyan lift (kütüphanenin tamamı; süzgeçsiz). Sıra: medyan lift azalan
   * (ölçülemeyen en sona), eşitlikte sayı azalan, sonra tür adı. Deterministik.
   */
  hookTypeStats(wsId: string): Promise<HookTypeStat[]>;

  // ---- Bildirimler + uyarı ayarları + haftalık özet
  /** Workspace'in uyarı kuralları ve kanalları (yoksa `DEFAULT_ALERT_SETTINGS`). SIR yok: yalnız "ayarlı mı" (`chatIdSet`). Bilinmeyen workspace → `not_found`. */
  getAlertSettings(wsId: string): Promise<AlertSettings>;
  /** Derin kısmi yama (bkz. `AlertSettingsPatch`); geçersiz → `invalid_input`, sohbeti bağlı olmayan Telegram'ı açmak → `invalid_state`. Güncel ayarlar döner. */
  updateAlertSettings(wsId: string, patch: AlertSettingsPatch): Promise<AlertSettings>;
  /** Yeniden eskiye; `unreadOnly` yalnız okunmamışlar; `cursor`/`limit` ile sayfalanır (`total` filtreye uyan sayı). */
  listNotifications(wsId: string, filter?: NotificationFilter): Promise<PagedResult<Notification>>;
  /** Okunmamış bildirim sayısı (üst şerit zil rozeti). Bilinmeyen workspace → `not_found`. */
  countUnreadNotifications(wsId: string): Promise<number>;
  /** İdempotent: zaten okunmuşsa `readAt` korunur. Yoksa `not_found`. */
  markNotificationRead(wsId: string, notificationId: string): Promise<Notification>;
  /** Tüm okunmamışları okundu yapar; bu çağrıda okundu yapılanların sayısını döndürür (0 geçerli). */
  markAllNotificationsRead(wsId: string): Promise<number>;
  /**
   * Haftalık özet: `now`dan geriye 7 gün (`now` çağıranın tek saatidir). Ölçülemeyen değer undefined'dır (0 değil),
   * sebep `unmeasuredReasons`'ta. Bilinmeyen workspace → `not_found`.
   */
  getWeeklyDigest(wsId: string, now: Date): Promise<WeeklyDigest>;

  // ---- Haftalık plan + ses profili + içgörü (Faz 2)
  /**
   * Haftanın planı (plana giren içerikler fikir kartıyla birlikte, adaylar ayrı). `weekStart` "YYYY-MM-DD" takvim günüdür
   * (`weekStartOf`, `lib/domain/weekly-plan.ts`): Pazartesi değilse o günün haftasına hizalanır; biçimsiz/var olmayan gün →
   * `invalid_input`. Plan yoksa ya da bilinmeyen workspace → null. Plan yalnız sunucu tarafından yazılır (`save_weekly_plan`).
   */
  getWeeklyPlan(wsId: string, weekStart: string): Promise<WeeklyPlan | null>;
  /** Planı onaylar (SPN-35): plana giren `new` fikirler `saved`, `approvedAt = now` (tek işlem; onaylıysa değişmez). Plan yok → `not_found`; `ready` değil → `invalid_state`. */
  approveWeeklyPlan(wsId: string, weekStart: string, now: Date): Promise<WeeklyPlan>;
  /** Geçmiş planlar, yeniden eskiye (`weekStart` azalan); fikirleri yüklemeden özet satırları. Bilinmeyen workspace → boş liste. */
  listWeeklyPlans(wsId: string, query?: WeeklyPlanListQuery): Promise<WeeklyPlanSummary[]>;
  /**
   * Kendi hesabın GÜNCEL marka sesi profili (hesap başına tek). Profil henüz üretilmediyse, hesap/workspace bilinmiyorsa → null
   * (0 değil, "yok"). Özelliklerin `verified` bayrağı kanıtlı alıntıdan gelir; script yalnız doğrulanmış özelliklerle yazılır.
   */
  getVoiceProfile(wsId: string, accountId: string): Promise<VoiceProfile | null>;
  /**
   * Karşılaştırma ekranının verisi (LLM'siz): kendi hesap ↔ izlenen rakipler tablosu, süre kovası × lift, CTA türü × lift,
   * benzer boy havuzu, veri kalitesi. Ölçülemeyen bölüm `unmeasured`'da sebebiyle gelir (boş/0 değil). Saat: depo saati
   * (`now`); saat/gün analizi hedef kitle diliminde (`Workspace.audienceTimeZone`). Bilinmeyen workspace/hesap → `not_found`.
   */
  getInsights(wsId: string, query?: InsightsQuery): Promise<Insights>;

  // ---- Fikir ↔ Reels bağı + ölçüm + geçen hafta (Faz 2 kapanış: döngüyü kapat)
  /**
   * Fikir ↔ Reels bağları, yeniden eskiye (`updatedAt`); `IdeaLinkFilter` fikre/duruma daraltır (bilinmeyen workspace/fikir → boş
   * liste). Her satır bağlı/önerilen içeriğin özetini taşır (içerik başına okuma yok). Fikir kartındaki aktif bağ ayrıca
   * `Idea.reelLink`'tedir; bekleyen otomatik öneriler `status: "suggested"` ile buradan okunur (tek sorgu, sayfa başına).
   */
  listIdeaLinks(wsId: string, filter?: IdeaLinkFilter): Promise<IdeaLink[]>;
  /**
   * Kullanıcı yayınladığı Reels'in bağlantısını fikre yapıştırır (kullanıcı linki verdi = onay). Bağlantı fikrin platform
   * modülüyle kısa koda çevrilir (tanınmayan → `invalid_input`). Kısa kod KENDİ hesap içeriğiyle eşleşirse bağ `confirmed` olur ve
   * fikir `published`'a geçer (`canConfirmIdeaLink`; önceki durum saklanır); eşleşmezse `awaiting_content` kalır (sonraki
   * toplamada çözülür). Aynı (fikir, kısa kod) satırı varsa yeniden kullanılır (`suggested`/`rejected` → onay; `confirmed`/
   * `awaiting_content` → aynen döner, idempotent); fikrin farklı kodlu bekleyen bağı varsa yenisi onun yerine geçer.
   * Hatalar: bilinmeyen fikir → `not_found`; `dismissed` fikir → `invalid_state`; fikrin başka kodla ONAYLI bağı ya da içerik başka
   * fikre onaylı → `already_exists` (önce bağı kaldır).
   */
  linkIdeaToReel(wsId: string, input: LinkIdeaToReelInput): Promise<IdeaLink>;
  /**
   * Otomatik önerinin kararı: YALNIZ `suggested` satır (aksi `invalid_state`; bilinmeyen → `not_found`). `confirm` → `confirmed`
   * + fikir `published`; fikir `dismissed` ise `invalid_state`; fikrin aktif bağı ya da içeriğin başka fikre onaylı bağı varsa
   * `already_exists` (bayat öneri). `reject` → `rejected` (aynı çift tekrar önerilmez). Güncel bağ döner.
   */
  resolveIdeaLink(wsId: string, linkId: string, decision: IdeaLinkDecision): Promise<IdeaLink>;
  /**
   * Fikrin aktif bağını kaldırır: `confirmed` → `rejected` (satır kalır) ve fikir ÖNCEKİ durumuna döner (bağ onayında saklanan);
   * `awaiting_content` → satır silinir. Fikrin aktif bağı yoksa `not_found`. Güncel fikir döner (`reelLink` undefined).
   */
  unlinkIdea(wsId: string, ideaId: string): Promise<Idea>;
  /**
   * "Geçen hafta": `weekStart` haftasının PLANI nasıl sonuçlandı (Pazartesi'ye hizalanır, biçimsiz → `invalid_input`). `/bu-hafta?hafta=W`
   * sayfası `W − 7` planını sorar. Plan yoksa ya da bilinmeyen workspace → null. Okuma anında hesaplanır (kayıtlı
   * `sections.review` yer tutucudur); `now` çağıranın tek saatidir (kontrol noktası durumları ona göredir). Ölçülemeyen değer
   * `undefined`'dır; D+1/D+3'te lift yoktur.
   */
  getWeekReview(wsId: string, weekStart: string, now: Date): Promise<WeekReview | null>;
  /**
   * Ölçüm penceresi açık ama ölçümü olmayan kendi Reels'ler (ücretsiz kontrol; Apify yok): `measure:check` ve `/bu-hafta` şeridi
   * bunu kullanır. Yayın tarihine göre eskiden yeniye; bilinmeyen workspace → boş liste. `now` çağıranın tek saatidir.
   */
  listMeasurementDue(wsId: string, now: Date): Promise<MeasurementDue[]>;
  /**
   * Kreatif Anatomisi (LLM'siz): analizli videolar, faz/boyut tabloları, tutan reçetesi (`AnatomyReport`: serileştirilebilir).
   * Saat: depo saati (`getInsights` gibi). Analiz yoksa boş rapor (her bölüm sebebiyle `unmeasured`'da, hata değil). Bilinmeyen
   * workspace/hesap → `not_found`.
   */
  getAnatomy(wsId: string, query?: AnatomyQuery): Promise<AnatomyReport>;
  /**
   * Kreatif Matris (açı × farkındalık katmanı): HER ZAMAN 20 hücre (`CreativeMatrix.cells`; boş hücreler dahil), hücre başına kendi/rakip
   * ayrı n + medyan lift + güven, baskın hook türleri, "kendi hesap denedi mi", ön matristen uygunluk ve kodla türetilmiş durum
   * (`cellStatusOf`). Yalnız kanıtı doğrulanmış etiketler (`content_creative_labels.evidence_verified`) hücre doldurur; niş dışı video
   * girmez. Etiket yoksa hata değil: 20 boş hücre + `unmeasuredReason` (`emptyCreativeMatrix`). Boş hücre ≠ lift 0 (`undefined`).
   * Saat: depo saati (`getAnatomy` gibi). Bilinmeyen workspace → `not_found`.
   */
  getCreativeMatrix(wsId: string, query?: CreativeMatrixQuery): Promise<CreativeMatrix>;
  /**
   * Konu × hook türü matrisi (`creator`/`mixed` hesabın kreatif çerçevesi; bkz. `domain/account-type.ts`): satır = konu kümesi
   * (`content_topic_clusters`), sütun = hook türü (`HOOK_TYPES`, yalnız `ok` + kanıtı doğrulanmış analizden). Hücre başına kendi/rakip ayrı n +
   * medyan lift + güven + tutan sayısı, ≤ 5 örnek ve kodla türetilmiş durum (`topicCellStatusOf`: tutan / denendi / zayıf / kanıtlı fırsat / boş).
   * RAKİP OLMAYABİLİR: rakipsiz hesapta rakip tarafı boş kalır, hücre durumu kendi verisinden türer, `winners` kendi tutanlarını sıralar.
   * Kümesi olmayan video satıra girmez (`unclusteredCount`); niş dışı video girmez. Küme yoksa hata değil: satırsız matris + `unmeasuredReason`
   * (`emptyTopicHookMatrix`). Saat: depo saati. Bilinmeyen workspace → `not_found`. Kümeler plan koşusunda yazılır (`content_topic_clusters`).
   */
  getTopicHookMatrix(wsId: string, query?: TopicHookMatrixQuery): Promise<TopicHookMatrix>;
  /**
   * Genel bakıştaki "Bugün bilmen gerekenler" kartı için Analist'in (`agent = analyst`) EN YENİ brifingi; hiç yoksa `null` (hata değil: boş
   * durum). Yazan sunucu görevi `brief:now` (`agent_briefings`); render sırasında LLM çağrısı yoktur. Madde metni sayıları yerleştirilmiş SON
   * metindir; bayatlık depoda hesaplanmaz (`briefingFreshness`, çağıranın saatiyle). Biçimi bozuk satır atlanır (bir önceki geçerli satır
   * döner; hiç geçerli yoksa `null`): bozuk kayıt sayfayı düşürmez. Bilinmeyen/biçimsiz workspace → `null` (`getWeeklyPlan` gibi).
   */
  getLatestBriefing(wsId: string): Promise<Briefing | null>;

  // ---- Panel işleri (panelden kontrol: iş kuyruğu + onaylı harcama; `domain/panel-job.ts`)
  /**
   * Yeni işi sıraya yazar (`queued`); işi ayrık işçi alır, depo iş KOŞTURMAZ. Girdi `lib/data/job-input.ts` ile doğrulanır: bilinmeyen tür,
   * fazla alan, önizlemesi olmayan türde `dryRun`, ONAYSIZ HARCAMA (`collect` / `measure` gerçek koşusu), harcamayan türe ya da kuru koşuya
   * onay, 0..`JOB_SPEND_MAX_USD` dışı tutar, türün kabul etmediği dayanak, aylık tavan onaysız / kapalıyken `monthly_cap` → `invalid_input`.
   * Önce çalışma alanının yanıt vermeyen işi kapatılır (`failed` + `worker_lost`); etkin (sırada / çalışan) iş varsa `already_exists`.
   * Onay verildiyse onaylayan = oturumdaki kullanıcı, an = şimdi; yazıldıktan sonra değişmez. Bilinmeyen workspace → `not_found`.
   */
  requestJob(wsId: string, input: RequestJobInput): Promise<PanelJob>;
  /** Çalışma alanının işleri, yeniden eskiye (`createdAt`); `JobFilter` duruma / etkinliğe daraltır. Bilinmeyen workspace → boş liste. */
  listJobs(wsId: string, filter?: JobFilter): Promise<PanelJob[]>;
  /** Tek iş; yoksa, başka çalışma alanındaysa ya da kimlik biçimsizse null. */
  getJob(wsId: string, jobId: string): Promise<PanelJob | null>;
  /**
   * Durdur. Sıradaki iş anında `cancelled`; çalışan işte `cancelRequestedAt` yazılır (iş adım / video sınırında durur, yapılan iş kalır;
   * tekrar çağrı ilk isteği korur); yanıt vermeyen çalışan iş `failed` + `worker_lost` olarak kapanır. Bitmiş iş → `invalid_state`; iş
   * yok ya da başka çalışma alanında → `not_found`. Güncel iş döner.
   */
  cancelJob(wsId: string, jobId: string): Promise<PanelJob>;

  // ---- Kredi defteri (`domain/credits.ts`). Kredi KULLANICIYA aittir: hesap depo bağlamındaki kullanıcıdır, `wsId` harcamanın yeridir.
  /** Türetilmiş bakiye (saklanmaz). Hiç kredi verilmediyse hepsi 0. Bilinmeyen workspace → `not_found`. */
  getCreditBalance(wsId: string): Promise<CreditBalance>;
  /** Hesabın hareketleri, yeniden eskiye (`onlyWorkspace`: yalnız bu çalışma alanı için yazılanlar). Bilinmeyen workspace → boş liste. */
  listCreditEntries(wsId: string, filter?: CreditEntryFilter): Promise<CreditEntry[]>;
  /**
   * İş başlamadan EN ÇOK krediyi ayırır (önce aylık kova). Yetmezse `insufficient_credits`, hiçbir şey yazılmaz. İdempotent: aynı anahtarla
   * ikinci çağrı ilk ayırmayı döndürür (başka tutarla `invalid_input`); iş başına tek açık ayırma (`already_exists`). Düşüm (kesinleştirme)
   * ve kredi verme depo üzerinden YAPILMAZ: işçi / sunucu işidir (`lib/credits/ledger.ts`).
   */
  reserveCredits(wsId: string, input: ReserveCreditsInput): Promise<CreditHold>;
  /** Açık ayırmayı düşmeden bırakır (iptal). İdempotent: kapanmış ayırma aynen döner. Ayırma yok → `not_found`. */
  releaseCredits(wsId: string, key: string): Promise<CreditHold>;

  // ---- Maliyet + koşular + ölçülemeyenler
  /** `month` = "YYYY-MM"; verilmezse içinde bulunulan ay (workspace saat diliminde). */
  getCostSummary(wsId: string, month?: string): Promise<CostSummary>;
  /** Yeniden eskiye; `cursor`/`limit` ile sayfalanır (bir ayın koşuları 200'den çok olabilir). */
  listRuns(wsId: string, filter?: RunFilter): Promise<PagedResult<CollectionRun>>;
  listUnmeasured(wsId: string): Promise<UnmeasuredEntry[]>;
}
