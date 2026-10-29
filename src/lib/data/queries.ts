/**
 * `PanelRepository` sorgu girdileri: filtreler, sayfalama ve mutasyon girdileri.
 * Sonuç modelleri `lib/domain/**`'tedir. Bu dosya yalnız sıralı ajanlar tarafından değiştirilir.
 *
 * Genel kurallar (tüm filtreler için):
 *  - Verilmeyen alan = filtre yok.
 *  - `since` ISO zaman damgası; içerikte `publishedAt >= since` demektir.
 *  - `cursor` opak bir dizgedir; yalnız önceki cevaptaki `nextCursor` geri verilir.
 *  - `limit` verilmezse depo varsayılanı (50) uygulanır; üst sınır 200.
 */
import type { AccountType } from "@/lib/domain/account-type";
import type { LiftTier } from "@/lib/domain/content";
import type { CompetitorSource, CompetitorStatus } from "@/lib/domain/competitor";
import type { ComplianceRegion } from "@/lib/domain/compliance";
import type { ContentLanguage } from "@/lib/domain/content-language";
import type { IdeaLinkStatus, IdeaStatus } from "@/lib/domain/intel";
import type { AlertTier } from "@/lib/domain/notification";
import type { JobStatus } from "@/lib/domain/panel-job";
import type { PublishStatus, TrialSettings } from "@/lib/domain/publish";
import type { RunProvider, RunStatus } from "@/lib/domain/run";
import type { ContentFormat, Platform } from "@/lib/platforms/types";

export const DEFAULT_PAGE_LIMIT = 50;
export const MAX_PAGE_LIMIT = 200;

export interface PagedResult<T> {
  items: T[];
  /** Sonraki sayfa varsa dolu. */
  nextCursor?: string;
  /** Filtreye uyan toplam kayıt (biliniyorsa). */
  total?: number;
}

// -------------------------------------------------------------- Genel bakış

export interface OverviewQuery {
  /** Dönem (gün). Varsayılan 30. */
  days?: number;
  /**
   * Yalnız bu KENDİ hesaba süz (`social_accounts.id`): takipçi/izlenme/etkileşim/yayın KPI'ları ve trend
   * serileri o hesabın verisidir; `recentOutliers` (rakip içerik) hesabın platformundaki tutanlara daralır.
   * Bilinmeyen kimlik → `RepositoryError("not_found")`. `tracked_competitors` hesaba göre değişmez.
   */
  accountId?: string;
  /**
   * Yalnız bu platform: kendi hesap KPI/trendleri ve `recentOutliers` o platformla sınırlanır.
   * `accountId` ile birlikte verilirse ikisi de uygulanır (platform hesabınkinden farklıysa sonuç boş/ölçülemez).
   */
  platform?: Platform;
}

// ------------------------------------------------------------------ İçerik

export type ContentSort = "recent" | "lift" | "views";

/** İçeriklerim ve genel içerik listesi. */
export interface ContentFilter {
  platform?: Platform;
  format?: ContentFormat;
  /** own: yalnız kendi hesaplar · competitor: yalnız rakipler. Verilmezse `own` ekranı için çağıran belirtir. */
  ownerKind?: "own" | "competitor";
  /** Belirli bir hesap (social_accounts.id ya da competitors.id). */
  ownerId?: string;
  minTier?: LiftTier;
  since?: string;
  hideLowConfidence?: boolean;
  hideImmature?: boolean;
  /** Başlık/alt yazı/handle içinde arama (büyük-küçük harf duyarsız). */
  search?: string;
  sort?: ContentSort;
  limit?: number;
  cursor?: string;
}

// ---------------------------------------------------------------- Outlier

export type OutlierSort = "lift" | "cross" | "recent";

/**
 * Tutan içerikler: yalnız İZLENEN (`tracked`) RAKİPLERİN içerikleri, skorlu olanlar. `ignored`, `candidate`, `private` ve
 * `not_found` rakiplerin içerikleri çıkmaz; kendi hesapların tutanları `listContent({ ownerKind: "own" })` ile okunur.
 * Rakibin durumu değişince sonuç hemen değişir.
 */
export interface OutlierFilter {
  platform?: Platform;
  format?: ContentFormat;
  /** En düşük lift kademesi. Varsayılan 3 (≥3x). */
  minTier?: LiftTier;
  since?: string;
  /** Yalnız sahibinin takipçisi kendi hesapların ±3x aralığında olanlar. */
  similarSizeOnly?: boolean;
  hideLowConfidence?: boolean;
  hideImmature?: boolean;
  competitorId?: string;
  /** Varsayılan "lift". */
  sort?: OutlierSort;
  limit?: number;
  cursor?: string;
}

// ------------------------------------------------------------------ Rakipler

export interface CompetitorFilter {
  platform?: Platform;
  status?: CompetitorStatus | CompetitorStatus[];
  source?: CompetitorSource;
  search?: string;
}

export interface DiscoveryFilter {
  platform?: Platform;
  source?: Exclude<CompetitorSource, "manual">;
  similarSizeOnly?: boolean;
  limit?: number;
}

export interface AddCompetitorInput {
  platform: Platform;
  /** Ham girdi olabilir ("@Kahve.Yeri", profil URL'si değil yalnız handle); depo defansif olarak
   *  kırpar, "@" atar, küçük harfe çevirir. Platforma özel kural: `PlatformModule.publicData.normalizeHandle`. */
  handle: string;
  /** Varsayılan "manual". */
  source?: CompetitorSource;
  /** Varsayılan "tracked" (elle eklenen rakip doğrudan takibe alınır). */
  status?: Extract<CompetitorStatus, "tracked" | "candidate">;
}

/** Kullanıcının verebileceği durumlar. `private`/`not_found` yalnız toplama sonucunda sunucu tarafından yazılır. */
export type UserSettableCompetitorStatus = Extract<CompetitorStatus, "candidate" | "tracked" | "ignored">;

// -------------------------------------------------------------------- Fikir

export interface IdeaFilter {
  status?: IdeaStatus | IdeaStatus[];
  platform?: Platform;
  limit?: number;
}

// -------------------------------------------------------------------- Yayın

export interface PublishJobFilter {
  status?: PublishStatus | PublishStatus[];
  socialAccountId?: string;
  /** Planlanan zaman aralığı (ISO, dahil). */
  from?: string;
  to?: string;
  limit?: number;
}

export interface CreatePublishJobInput {
  socialAccountId: string;
  ideaId?: string;
  caption?: string;
  /** Özel Storage yolu (`publish-media`). */
  mediaPath?: string;
  coverPath?: string;
  /** Stüdyo siparişi kimliği (`order_return` işi yazar); aynı sipariş için etkin ikinci satır `already_exists`. */
  orderId?: string;
  /** Varsayılan true (Reels akışta da görünsün). */
  shareToFeed?: boolean;
  scheduledFor?: string;
  paidPartnership?: boolean;
  aiGenerated?: boolean;
  /** Reklam veren adı (kırpılır, ≤ `ADVERTISER_NAME_MAX` karakter; boş = yok). */
  advertiserName?: string;
  /** Trial Reels ayarı (verilmezse normal yayın). `graduation` geçersizse `invalid_input`. */
  trial?: TrialSettings;
  /** Varsayılan "draft". "awaiting_approval" ile onaya gönderilebilir; başka durum verilemez. */
  status?: "draft" | "awaiting_approval";
}

// ---------------------------------------------------------------- Workspace

/** Aylık bütçe tavanı (USD) üst sınırı; 0 geçerlidir (harcama kapalı). */
export const MAX_CAP_USD = 1000;
/** Niş tanımı üst sınırı (karakter, Unicode kod noktası). */
export const NICHE_BRIEF_MAX_LENGTH = 2000;

/**
 * `updateWorkspace` yaması: yalnız verilen alanlar değişir (verilmeyen = dokunma).
 * Tavan: sayı (0..`MAX_CAP_USD`); 0 = harcama kapalı (yeni paralı koşu başlamaz). Tavan KALDIRILAMAZ: `null` ya da
 * boş değer geçersizdir (`invalid_input`); `undefined` "değiştirme" demektir.
 * Niş tanımı: en çok `NICHE_BRIEF_MAX_LENGTH` karakter, baş/son boşluk kırpılır; boş metin niş tanımını siler.
 * Doğrulama uygulama başına ayrıca yapılır (`lib/data/workspace-patch.ts`); geçersiz → `invalid_input`.
 */
export interface WorkspacePatch {
  apifyMonthlyCapUsd?: number;
  llmMonthlyCapUsd?: number;
  /**
   * Aylık ÖLÇÜM tavanı (USD, 0..`MAX_CAP_USD`; yalnız `purpose = measurement` koşuları sayar): verilmesi kullanıcının ONAYIDIR —
   * depo `measureCapApprovedAt`'ı o anın saatiyle birlikte yazar. Varsayılan onaysızdır (`Workspace.measureMonthlyCapUsd`
   * undefined: ölçüm harcaması yok). Diğer tavanlar gibi KALDIRILAMAZ (`null` geçersiz); 0 = ölçüm kapalı (onaylı).
   */
  measureMonthlyCapUsd?: number;
  /** Aylık AJAN tavanı (USD, 0..`MAX_CAP_USD`): verilmesi ONAYDIR; kaldırılamaz, 0 = kapalı. Ajan kendi tavanını değiştiremez. */
  agentMonthlyCapUsd?: number;
  /** Ajan ritmi: toplama sıklığı (gün), hesap başına video, hedef rakip sayısı (sınırlar `domain/agent-settings.ts`). */
  collectEveryDays?: number; collectVideoLimit?: number; rivalTarget?: number;
  autoWeeklyPlan?: boolean; autoMeasure?: boolean; autoProduce?: boolean; // Otomatik işler (0037): kapalıysa halka açmaz; undefined = dokunma
  nicheBrief?: string;
  /** Yayın uyum bölgesi ("TR" | "US" | "TR_US"); başka değer → `invalid_input`. */
  complianceRegion?: ComplianceRegion;
  /** Hesabın içerik dili ("tr" | "en"); `null` = ayarı kaldır (otomatik çözüm); undefined = dokunma; başka değer → `invalid_input`. */
  contentLanguage?: ContentLanguage | null;
  /** Hesap türü ("business" | "creator" | "mixed"); undefined = dokunma; kaldırılamaz (`null` geçersiz); başka değer → `invalid_input`. */
  accountType?: AccountType;
}

// -------------------------------------------------------------- Koleksiyon

/**
 * Yeni koleksiyon. Ad kırpılır, 1..`COLLECTION_NAME_MAX` karakter; workspace içinde benzersizdir
 * (`collectionNameKey`: Türkçe İ/ı ve büyük-küçük harf duyarsız) → `already_exists`. Açıklama ≤ `COLLECTION_DESCRIPTION_MAX`.
 * Doğrulama `lib/data/collection-input.ts`'te tek yerdedir; geçersiz girdi → `invalid_input`.
 */
export interface CreateCollectionInput {
  name: string;
  description?: string;
}

// ------------------------------------------------------------- Bildirimler

/** Bildirim listesi: yeniden eskiye (`createdAt`); `unreadOnly` yalnız okunmamışları getirir. */
export interface NotificationFilter {
  unreadOnly?: boolean;
  limit?: number;
  cursor?: string;
}

/**
 * `updateAlertSettings` yaması (derin kısmi): yalnız verilen alanlar değişir. Yamayı depo doğrular
 * (`lib/data/alert-settings-patch.ts`, tek yerde); geçersiz → `invalid_input`.
 *  - `minTier` 1..4; `weekday` 0..6 (0 = Pzt); `hour` 0..23.
 *  - `channels.inApp` yamalanamaz (hep açık); SIR alanları (Telegram anahtarı/sohbet kimliği, e-posta şifresi) yamada
 *    YOKTUR: `telegram.chatIdSet` yalnız sunucu tarafında set edilir; bilinmeyen alan → `invalid_input`.
 *  - E-posta kanalını açmak adres ister (`invalid_input`); adres "" ise silinir. Sohbeti bağlı olmayan Telegram
 *    kanalını açmak → `invalid_state`.
 */
export interface AlertSettingsPatch {
  competitorOutlier?: { enabled?: boolean; minTier?: AlertTier };
  ownOutlier?: { enabled?: boolean; minTier?: AlertTier };
  weeklyDigest?: { enabled?: boolean; weekday?: number; hour?: number };
  channels?: {
    email?: { enabled?: boolean; address?: string };
    telegram?: { enabled?: boolean };
  };
}

// ------------------------------------------------------- Hook kütüphanesi

export type HookLibrarySort = "lift" | "recent";

/**
 * Hook kütüphanesi (`listHookLibrary`). `own`: true = yalnız kendi içerikler, false = yalnız rakipler, verilmezse hepsi.
 * `minTier`: lift kademesi ölçülmemiş giriş süzülür. `q`: hook metni, hesap adı ya da hook türü etiketinde arama
 * (Türkçe İ/ı ve büyük-küçük harf duyarsız). `sort`: "lift" (varsayılan; ölçülemeyen en sona) | "recent" (yayın tarihi).
 */
export interface HookLibraryFilter {
  hookType?: string;
  minTier?: LiftTier;
  own?: boolean;
  q?: string;
  sort?: HookLibrarySort;
  limit?: number;
  cursor?: string;
}

// --------------------------------------------------- Haftalık plan + içgörü

/** `listWeeklyPlans`: yeniden eskiye (`weekStart` azalan); `limit` verilmezse varsayılan (50), üst sınır 200. */
export interface WeeklyPlanListQuery {
  limit?: number;
}

/** İçgörü penceresi (gün): varsayılan 90 (kendi son 90 gün); `days` bu aralığa kırpılır. */
export const DEFAULT_INSIGHTS_DAYS = 90;
export const MIN_INSIGHTS_DAYS = 7;
export const MAX_INSIGHTS_DAYS = 365;

/**
 * `getInsights` (Karşılaştırma ekranı; LLM'siz): `accountId` verilirse kendi taraf o hesaba daralır (rakipler aynı kalır;
 * bilinmeyen kimlik → `RepositoryError("not_found")`); verilmezse tüm kendi hesaplar. `days` geriye bakış penceresi
 * (`MIN_INSIGHTS_DAYS`..`MAX_INSIGHTS_DAYS`, varsayılan `DEFAULT_INSIGHTS_DAYS`; kırpılır).
 */
export interface InsightsQuery {
  accountId?: string;
  days?: number;
}

// ------------------------------------------------- Fikir ↔ Reels bağı + anatomi

/** Yapıştırılan içerik bağlantısı üst sınırı (karakter). */
export const LINK_URL_MAX_LENGTH = 500;

/**
 * `listIdeaLinks`: yeniden eskiye (`updatedAt`). `status` verilmezse hepsi (reddedilenler dahil); `ideaId` bir fikre daraltır
 * (bilinmeyen fikir → boş liste). `limit` verilmezse varsayılan (50), üst sınır 200.
 */
export interface IdeaLinkFilter {
  ideaId?: string;
  status?: IdeaLinkStatus | IdeaLinkStatus[];
  limit?: number;
}

/**
 * `linkIdeaToReel` girdisi: kullanıcının yapıştırdığı içerik bağlantısı (`url`). Doğrulama `lib/data/idea-link-input.ts`'te tek
 * yerdedir (zod + platform modülünün `parseContentUrl`'ü); geçersiz/tanınmayan bağlantı → `invalid_input`.
 */
export interface LinkIdeaToReelInput {
  ideaId: string;
  url: string;
}

/**
 * `getAnatomy` (Kreatif Anatomisi; LLM'siz): `getInsights` ile aynı kapsam kuralları — `accountId` verilirse kendi taraf o hesaba
 * daralır (rakipler aynı kalır; bilinmeyen kimlik → `RepositoryError("not_found")`), `days` geriye bakış penceresi
 * (`MIN_INSIGHTS_DAYS`..`MAX_INSIGHTS_DAYS`, varsayılan `DEFAULT_INSIGHTS_DAYS`; kırpılır).
 */
export interface AnatomyQuery {
  accountId?: string;
  days?: number;
}

/**
 * `getCreativeMatrix` (Kreatif Matris; LLM'siz hesap): tüm kendi hesaplar ↔ izlenen rakipler. `days` geriye bakış penceresi
 * (`MIN_INSIGHTS_DAYS`..`MAX_INSIGHTS_DAYS`, varsayılan `DEFAULT_INSIGHTS_DAYS`; kırpılır).
 */
export interface CreativeMatrixQuery {
  days?: number;
}

/**
 * `getTopicHookMatrix` (konu × hook türü matrisi; LLM'siz hesap): tüm kendi hesaplar ↔ izlenen rakipler (rakip yoksa yalnız kendi). `days`
 * geriye bakış penceresi (`MIN_INSIGHTS_DAYS`..`MAX_INSIGHTS_DAYS`, varsayılan `DEFAULT_INSIGHTS_DAYS`; kırpılır), `CreativeMatrixQuery` ile aynı.
 */
export interface TopicHookMatrixQuery {
  days?: number;
}

// --------------------------------------------------------------- Panel işi

/**
 * Harcama onayı girdisi: tek seferlik tutar (0 < `maxUsd` ≤ `JOB_SPEND_MAX_USD`) ya da çalışma alanının onaylı aylık tavanı. Onaylayan
 * ve onay anı girdide YOKTUR: depo oturumdaki kullanıcıyı ve şimdiki anı yazar.
 */
export type JobApprovalInput = { basis: "one_time"; maxUsd: number } | { basis: "monthly_cap" };

/**
 * `requestJob` girdisi: tür beyaz listeden (`JOB_KINDS`), alanlar türe göre; bilinmeyen alan reddedilir. `dryRun` yalnız önizlemesi olan
 * türde; `approval` yalnız harcayabilen türde ve gerçek koşuda (`collect` / `measure` gerçek koşusunda ZORUNLU). `limit` hesap başına
 * içerik sayısı (1..`JOB_COLLECT_LIMIT_MAX`), `week` planın Pazartesi'si (YYYY-MM-DD). Doğrulama `lib/data/job-input.ts`'te tek yerdedir
 * (depo uygulamaları ve `requestJobAction` aynı şema); geçersiz → `invalid_input`. Başlangıç işi (`onboarding`) onay / kredi alanı TAŞIMAZ:
 * onayı sunucu aşamanın sabit tavanıyla yazar (`ONBOARDING_PHASE_SPEC`). Ekranlar onu `requestJob` ile değil akış metotlarıyla açar
 * (`startOnboardingProbe`, `startOnboardingBuild`; girdileri `onboarding-input.ts`).
 */
export type RequestJobInput =
  | ((
      | { kind: "routine"; dryRun?: boolean; approval?: JobApprovalInput }
      | { kind: "collect"; dryRun?: boolean; limit?: number; approval?: JobApprovalInput; source?: "agent" }
      | { kind: "measure"; dryRun?: boolean; approval?: JobApprovalInput }
      | { kind: "analyze" | "label" | "briefing"; source?: "cycle" }
      | { kind: "plan"; week?: string; source?: "cycle" }
      | { kind: "discover"; approval?: JobApprovalInput; source?: "agent" }
      | { kind: "produce"; orderId: string; approval?: JobApprovalInput }
    ) &
      JobCreditsInput)
  | { kind: "measure_zernio"; source?: "cycle" }
  | { kind: "order"; week: string; slot?: string; ideaId?: string; source?: "cycle" }
  | { kind: "order_return"; source?: "cycle" }
  | { kind: "publish"; source?: "cycle" }
  | { kind: "ads_sync"; source?: "cycle" }
  | OnboardingJobInput;

/** Başlangıç işi isteği: `probe` (hesaba bakış) ya da `build` (ilk tur). `rivalIds` YALNIZ `build`'de: izlemeye alınan rakipler (≤ `ONBOARDING_RIVALS_MAX`). */
export type OnboardingJobInput = { kind: "onboarding"; phase: "probe" | "build"; rivalIds?: string[] };

/**
 * Kredi onayı (her türde isteğe bağlı): bu iş için EN ÇOK harcanacak kredi. Yalnız kredi zorlaması açıkken (`CREDITS_ENFORCED`) anlam
 * taşır: verilmezse türün güvenli üst sınırı ayrılır (`jobHoldCredits`); verilirse o kadar (üst sınırı aşamaz). Zorlama kapalıyken yok sayılır.
 * USD onayının (`approval`) yerine GEÇMEZ. Önizlemede ve kredi harcamayan türde (`label`) verilemez.
 */
export type JobCreditsInput = { maxCredits?: number };

/** `listJobs`: yeniden eskiye (`createdAt`). `active: true` yalnız etkin, `false` yalnız bitmiş işler; `limit` varsayılan 50, üst sınır 200. */
export interface JobFilter {
  status?: JobStatus | JobStatus[];
  active?: boolean;
  limit?: number;
}

// --------------------------------------------------------------------- Koşu

export interface RunFilter {
  provider?: RunProvider;
  status?: RunStatus | RunStatus[];
  since?: string;
  limit?: number;
  cursor?: string;
}
