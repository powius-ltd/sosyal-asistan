/**
 * Yayın işi alan tipleri. Tablo: `publish_jobs` (PLAN.md "Veri modeli").
 *
 * Kural: yalnız resmi Content Publishing API; HER yayın insan onaylı — DB check constraint
 * + trigger, `awaiting_approval → approved` geçişini yalnız kullanıcı yapar; worker
 * (`approved` sonrası) yayın durumlarını ilerletir.
 *
 * Durum makinesi (idempotent, `lib/publish/state-machine.ts` F3):
 *   draft → awaiting_approval → approved → container_pending → ready → publishing → published
 *   herhangi bir aşamadan: failed · container süresi dolarsa: expired (yeniden oluşturulur)
 *   yayına çıkmadan önce: cancelled
 */
import type { Platform } from "@/lib/platforms/types";

export type PublishStatus =
  | "draft"
  | "awaiting_approval"
  | "approved"
  | "container_pending"
  | "ready"
  | "publishing"
  | "published"
  | "failed"
  | "expired"
  | "cancelled";

export const PUBLISH_STATUSES: readonly PublishStatus[] = [
  "draft",
  "awaiting_approval",
  "approved",
  "container_pending",
  "ready",
  "publishing",
  "published",
  "failed",
  "expired",
  "cancelled",
];

/** "Onaya gönder" YALNIZ taslaktan (`draft` → `awaiting_approval`). */
export function canSubmit(status: PublishStatus): boolean {
  return status === "draft";
}

/** Onay düğmesi YALNIZ bu durumda etkin. */
export function canApprove(status: PublishStatus): boolean {
  return status === "awaiting_approval";
}

/**
 * İptal yalnız yayın başlamadan (publishing/published/cancelled dışında) mümkün. `ready` + dolu `containerId` satır (Zernio'da zamanlanmış
 * gönderi) panelden iptal EDİLEMEZ: satırı iptal etmek Zernio'daki gönderiyi silmez, o gizlice yayımlanırdı (Zernio'dan silinmeli).
 */
export function canCancel(status: PublishStatus, containerId?: string | null): boolean {
  if (containerId && status === "ready") return false;
  return status !== "publishing" && status !== "published" && status !== "cancelled";
}

/**
 * `getPublishSummary` sonucu: Yayın ekranının onay bekleyen sayısı ve kota sayımı — iş listesinden (sayfa/limit
 * varsayımıyla) türetilmez, depo sayar.
 */
export interface PublishSummary {
  /** Onay bekleyen (`awaiting_approval`) iş sayısı (workspace'in tümü). */
  pendingApproval: number;
  /**
   * Hesap kimliği (`social_accounts.id`) → `now`dan geriye 24 saatte yayınlanan (`published`) iş sayısı
   * (`isPublishedWithinQuotaWindow`). Yayını olmayan hesap için anahtar yoktur (= ölçülmüş 0).
   */
  publishedLast24hByAccount: Record<string, number>;
}

/** Kota penceresi: hesap başına 24 saatlik hareketli pencere (Meta yayın kotası). */
export const PUBLISH_QUOTA_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * İş `now`dan geriye 24 saat içinde yayınlandı mı: `published` ve yayın anı `(now − 24s, now]`. Yayın anı yerine
 * son güncelleme zamanı (`updatedAt`) kullanılır (Faz 3'te `published_at` gelir).
 */
export function isPublishedWithinQuotaWindow(job: Pick<PublishJob, "status" | "updatedAt">, now: Date): boolean {
  if (job.status !== "published") return false;
  const at = new Date(job.updatedAt).getTime();
  return Number.isFinite(at) && at <= now.getTime() && now.getTime() - at < PUBLISH_QUOTA_WINDOW_MS;
}

// ---------------------------------------------------------------- Trial Reels + reklam veren

/**
 * Trial Reels mezuniyet stratejisi: "manual" = elle (Instagram API `MANUAL`), "performance" = performansa göre otomatik
 * (`SS_PERFORMANCE`); Content Publishing API `trial_params.graduation_strategy` (docs/RAKIP-ANALIZI.md K24).
 */
export type TrialGraduation = "manual" | "performance";

export const TRIAL_GRADUATIONS: readonly TrialGraduation[] = ["manual", "performance"];

export interface TrialSettings {
  /** Trial Reels olarak yayınlanır (yalnız takipçi olmayanlara gösterilir; sonuç 72 saat sonra). */
  enabled: boolean;
  graduation: TrialGraduation;
}

/** Reklam veren (marka) adı üst sınırı (kod noktası). */
export const ADVERTISER_NAME_MAX = 100;

export interface PublishJob {
  id: string;
  workspaceId: string;
  /** Yayının çıkacağı kendi hesap (social_accounts.id). */
  socialAccountId: string;
  platform: Platform;
  /** Kaynak fikir (varsa). */
  ideaId?: string;
  status: PublishStatus;
  caption?: string;
  /** Özel Storage (`publish-media`) yolu; UI'a signed URL ile açılır. */
  mediaPath?: string;
  coverPath?: string;
  /** Stüdyo siparişinin kimliği (fiş `siparis_id`); dönüş yoluyla açılan satırda dolu. Aynı sipariş için etkin tek satır (DB benzersiz indeksi). */
  orderId?: string;
  shareToFeed: boolean;
  /** Planlanan yayın zamanı (ISO). undefined = onay sonrası hemen. */
  scheduledFor?: string;
  /**
   * Ücretli iş birliği: açıklamada ibare gerekir (`lib/compliance`). Onaya gönderme/onay bu işarete ve
   * workspace'in uyum bölgesine göre depoda engellenebilir (`fail`).
   */
  paidPartnership: boolean;
  /** Yapay zekâ ile üretilmiş içerik → açıklamada açık beyan gerekir (`lib/compliance`). */
  aiGenerated: boolean;
  /** Reklam veren (marka) adı; ücretli iş birliğinde açıklamada görünmesi beklenir (uyarı). Yoksa undefined. */
  advertiserName?: string;
  /** Trial Reels ayarı; undefined = normal yayın (trial değil). */
  trial?: TrialSettings;
  approvedAt?: string;
  /**
   * Onaylayan kullanıcının kimliği (insan onayı kaydı; `approvedAt` ile birlikte dolar). Depo onay anında oturumdaki
   * kullanıcıyı yazar (Faz 1: `auth.uid()`; mock: `"mock-user"`). Onaydan önce undefined.
   */
  approvedBy?: string;
  /** IG container id (container_pending sonrası). */
  containerId?: string;
  containerExpiresAt?: string;
  /** Yayınlanınca platformdaki id/permalink. */
  externalId?: string;
  permalink?: string;
  /** status=failed/expired ise sebep. */
  error?: string;
  /**
   * Yayın denemesi sayısı (container oluşturma / yayınlama girişimleri, yeniden denemeler dahil).
   * Onaydan önce ve hiç denenmemişse 0 (gerçek sayaç: ölçülemeyen değil, ölçülmüş sıfır).
   */
  attemptCount: number;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------- Açıklama (caption) kuralları

/** Instagram Content Publishing API: açıklama en fazla 2200 karakter (kod noktası). */
export const CAPTION_MAX = 2200;

/** Bir gönderide en fazla 30 hashtag. */
export const HASHTAG_MAX = 30;

/**
 * Açıklama uzunluğu KOD NOKTASI ile sayılır (emoji "👍" 1 karakter; `String.length` 2 sayardı).
 * Form sayacı, sunucu şeması ve depo aynı sayımı kullanır.
 */
export function countCaptionChars(text: string): number {
  return Array.from(text).length;
}

// '#' kelime dışı bir karakterden (ya da baştan) sonra gelir; "a#b" ya da "&#39;" hashtag değildir.
const HASHTAG_PATTERN = /(?:^|[^\p{L}\p{N}_&])#[\p{L}\p{N}_]+/gu;

export function countHashtags(text: string): number {
  return text.match(HASHTAG_PATTERN)?.length ?? 0;
}

/** Açıklama sınırı ihlali → Türkçe mesaj (yoksa undefined). Zod şeması ve depo aynı kuralı buradan uygular. */
export function captionLimitProblem(caption: string | undefined): string | undefined {
  if (caption === undefined) return undefined;
  if (countCaptionChars(caption) > CAPTION_MAX) return `Açıklama en fazla ${CAPTION_MAX} karakter olabilir.`;
  if (countHashtags(caption) > HASHTAG_MAX) return `Açıklamada en fazla ${HASHTAG_MAX} hashtag olabilir.`;
  return undefined;
}

/** Onaya göndermek (`awaiting_approval`) için açıklama zorunlu; boş/yalnız boşluk → bu mesaj. Depo ve form aynı kuralı uygular. */
export const CAPTION_REQUIRED_MESSAGE = "Onaya göndermek için açıklama yaz.";

export function captionRequiredProblem(caption: string | undefined): string | undefined {
  return caption === undefined || caption.trim() === "" ? CAPTION_REQUIRED_MESSAGE : undefined;
}
