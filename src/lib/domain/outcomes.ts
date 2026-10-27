/**
 * Döngüyü kapatma alan tipleri (Faz 2 kapanış, docs/FAZ2-KAPANIS-PLAN.md §2): fikir ↔ yayınlanan Reels bağı, 1/3/7 gün
 * ölçüm kontrol noktaları, "Geçen hafta" sonucu ve "ölçüm zamanı geldi" listesi. Hesap `lib/outcomes/**`'tedir (mock ve
 * Supabase AYNI fonksiyonları çağırır); burası yalnız sözleşmedir.
 *
 * Kurallar:
 *  - Kontrol noktası `metric_snapshots`'tan TÜRETİLİR (yeni tablo yok); kaçırılan nokta "zamanında ölçülmedi"dir, 0 DEĞİL.
 *  - D+1/D+3 yalnız ham izlenme + izlenme/takipçi; lift/kademe YALNIZ D+7 (olgunlaşmamış izlenme olgun baz çizgisiyle kıyaslanmaz).
 *  - Ölçülemeyen değer `undefined`'dır (0 değil); ekranda `MeasuredValue` ile tire + sebep.
 */
import type { LiftTier } from "@/lib/domain/content";
import type { ContentSummary } from "@/lib/domain/content-summary";
import type { IdeaLinkOrigin, IdeaLinkStatus, IdeaReelLink } from "@/lib/domain/intel";
import type { FocusGroup } from "@/lib/domain/weekly-plan";

// ------------------------------------------------------------- Fikir ↔ Reels

/** Bir fikir ↔ Reels bağı satırı (`idea_content_links`); `listIdeaLinks` döndürür. */
export interface IdeaLink {
  id: string;
  workspaceId: string;
  ideaId: string;
  /** Instagram kısa kodu (büyük/küçük harf duyarlı). */
  shortcode: string;
  status: IdeaLinkStatus;
  origin: IdeaLinkOrigin;
  /** Bağlı/önerilen kendi içerik; `awaiting_content` iken undefined. */
  contentItemId?: string;
  /** Bağlı/önerilen içeriğin özeti (güncel lift dahil; liste başına içerik okuması yok); `awaiting_content` iken undefined. */
  content?: ContentSummary;
  /** Otomatik eşleşme skoru (0..1; 0,6·metin + 0,4·zaman). Elle linkte undefined (skor yok, 0 değil). */
  score?: number;
  /** Eşleşme gerekçeleri (kısa Türkçe cümleler; elle linkte boş). */
  reasons: string[];
  createdAt: string;
  updatedAt: string;
}

/** `IdeaLink` → fikir kartındaki aktif bağ görünümü (yalnız `awaiting_content`/`confirmed` için geçerli). */
export function toIdeaReelLink(link: IdeaLink): IdeaReelLink | undefined {
  if (link.status !== "awaiting_content" && link.status !== "confirmed") return undefined;
  return {
    linkId: link.id,
    status: link.status,
    origin: link.origin,
    shortcode: link.shortcode,
    contentItemId: link.contentItemId,
    content: link.content,
  };
}

/** `resolveIdeaLink` kararı: öneriyi onayla (fikir `published` olur) ya da reddet (aynı çift tekrar önerilmez). */
export type IdeaLinkDecision = "confirm" | "reject";

export const IDEA_LINK_DECISIONS: readonly IdeaLinkDecision[] = ["confirm", "reject"];

// --------------------------------------------------------- Kontrol noktaları

/** Yayından sonraki gün sayısı: D+1, D+3, D+7. */
export type CheckpointDay = 1 | 3 | 7;

export const CHECKPOINT_DAYS: readonly CheckpointDay[] = [1, 3, 7];

export const CHECKPOINT_LABEL: Record<CheckpointDay, string> = { 1: "1. gün", 3: "3. gün", 7: "7. gün" };

/**
 * Kabul penceresi (yayından sonra, dahil gün sınırları): D+1 [1,2], D+3 [3,5], D+7 [7,10]. Pencere içindeki ilk ölçüm kontrol
 * noktasını doldurur; pencereler ayrıktır (bir Reels'in aynı anda en çok bir bekleyen noktası olur).
 */
export const CHECKPOINT_WINDOW_DAYS: Record<CheckpointDay, { from: number; to: number }> = {
  1: { from: 1, to: 2 },
  3: { from: 3, to: 5 },
  7: { from: 7, to: 10 },
};

/**
 * measured: pencerede ölçüm var · due: pencere açık, ölçüm yok (ölçülmeli) · upcoming: pencere henüz açılmadı ·
 * missed: pencere kapandı, ölçüm yok ("zamanında ölçülmedi"; 0 DEĞİL).
 */
export type CheckpointStatus = "measured" | "due" | "upcoming" | "missed";

export const CHECKPOINT_STATUS_LABEL: Record<CheckpointStatus, string> = {
  measured: "Ölçüldü",
  due: "Ölçülmeli",
  upcoming: "Bekleniyor",
  missed: "Zamanında ölçülmedi",
};

/** "Yön tuttu" eşikleri (kullanıcı adına ana oturum kararı): D+7 lift ≥ 1,0 tuttu; ≥ 1,5 güçlü tuttu. */
export const DIRECTION_HELD_MIN_LIFT = 1.0;
export const DIRECTION_STRONG_MIN_LIFT = 1.5;

/** Bir Reels'in tek kontrol noktası. Sayılar yalnız `status = measured` iken dolu olabilir; yoksa undefined (0 değil). */
export interface Checkpoint {
  day: CheckpointDay;
  status: CheckpointStatus;
  /** Pencere başı/sonu (ISO): yayın anı + `CHECKPOINT_WINDOW_DAYS`. */
  windowStart: string;
  windowEnd: string;
  /** Pencere içindeki ölçüm anı (measured). */
  capturedAt?: string;
  views?: number;
  /** İzlenme ÷ takipçi; takipçi bilinmiyorsa undefined. */
  viewsPerFollower?: number;
  /** YALNIZ D+7: lift (kendi baz çizgisine göre). D+1/D+3'te her zaman undefined. */
  lift?: number;
  /** YALNIZ D+7: lift kademesi. */
  liftTier?: LiftTier;
  /** Sayı neden yok (missed/upcoming/due ya da ölçülemeyen alan): ekranda `MeasuredValue` sebebi. */
  reason?: string;
}

// ----------------------------------------------------------- Geçen hafta

/** Yön hükmü: tuttu · tutmadı · ölçülemedi (yayın yöne uymadı ya da D+7 lift yok → hüküm yok, 0 değil). */
export type DirectionVerdict = "held" | "missed" | "unmeasured";

export const DIRECTION_VERDICT_LABEL: Record<DirectionVerdict, string> = {
  held: "Tuttu",
  missed: "Tutmadı",
  unmeasured: "Ölçülemedi",
};

/** Bir yayının bir yön üzerindeki sonucu. */
export interface DirectionOutcome {
  group: FocusGroup;
  /** Taksonomi anahtarı ya da konu adı. */
  value: string;
  label: string;
  verdict: DirectionVerdict;
  /** `held` ve D+7 lift ≥ `DIRECTION_STRONG_MIN_LIFT`. */
  strong?: boolean;
  /** `unmeasured` sebebi ("yayın bu yöne uymadı", "7. gün ölçümü yok" …). */
  reason?: string;
}

/** Planın bir yönü için hafta toplamı (`feedback.ts` girdisi): hükümler yayınlardan sayılır. */
export interface DirectionReview {
  group: FocusGroup;
  value: string;
  label: string;
  held: number;
  missed: number;
  unmeasured: number;
}

/** Bir plan öğesinin sonucu. */
export interface WeekReviewItem {
  ideaId: string;
  title: string;
  /** Plandaki sıra (1..5). */
  position?: number;
  /** Planlanan paylaşım anı (slot). */
  plannedAt?: string;
  /** Aktif bağ (onaylı ya da içerik bekleyen); undefined = bağ yok ("henüz yayınlandı mı bilinmiyor"). */
  link?: IdeaReelLink;
  /** Bu fikir için bekleyen otomatik öneri sayısı (kullanıcı onayı bekliyor). */
  suggestionCount: number;
  /** Bağlı Reels'in yayın anı ve süresi; bağ/içerik yoksa undefined. */
  publishedAt?: string;
  durationSec?: number;
  /** Üç nokta (D+1, D+3, D+7); içerik bağlı değilse boş. */
  checkpoints: Checkpoint[];
  /** Plan yönlerinden bu yayının uyduklarının hükmü (uymayan yön listede yoktur). */
  directions: DirectionOutcome[];
}

export interface WeekReviewSummary {
  /** Plana giren öğe sayısı. */
  planned: number;
  /** Aktif bağı olan (içerik bağlı/onaylı) öğe sayısı. */
  linked: number;
  /** D+7 ölçümü olan öğe sayısı. */
  measuredD7: number;
  /** Plan yönü hükmü sayıları (öğe × yön). */
  held: number;
  missed: number;
  unmeasured: number;
}

/**
 * `getWeekReview` sonucu: `weekStart` haftasının PLANI nasıl sonuçlandı. `/bu-hafta?hafta=W` sayfasındaki "Geçen hafta" = `W − 7`
 * planının sonucu. Okuma anında hesaplanır (kayıtlı `sections.review` yer tutucudur); `computedAt` çağıranın saatidir.
 */
export interface WeekReview {
  planId: string;
  /** Gözden geçirilen planın haftası (Pazartesi, YYYY-MM-DD). */
  weekStart: string;
  planGeneratedAt: string;
  computedAt: string;
  items: WeekReviewItem[];
  /** Planın odak yönleri için hafta toplamı (geri besleme bunu okur). */
  directions: DirectionReview[];
  summary: WeekReviewSummary;
}

// -------------------------------------------------------- Ölçüm zamanı geldi

/** `listMeasurementDue` satırı: ölçüm penceresi açık ama ölçümü olmayan kendi Reels (ücretsiz kontrol; Apify yok). */
export interface MeasurementDue {
  contentItemId: string;
  /** Kendi hesap kullanıcı adı ("@" yok). */
  ownerHandle: string;
  shortcode?: string;
  url?: string;
  publishedAt: string;
  /** Hangi nokta ölçülmeli (pencereler ayrık: en çok biri). */
  day: CheckpointDay;
  windowStart: string;
  windowEnd: string;
  /** Reels bir fikre onaylı bağlıysa o fikir. */
  ideaId?: string;
}
