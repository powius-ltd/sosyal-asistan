/**
 * İçerik alan tipleri: içerik + son metrikler + skor önbelleği + zaman serisi.
 * Tablolar: `content_items`, `metric_snapshots`, `content_latest_metrics` (view), `account_snapshots`.
 *
 * Metodoloji (deterministik, LLM yok — hesaplama `lib/metrics/**`'te):
 *  - baz çizgisi = hesabın aynı format VE aynı viewsKind içindeki son 25 içeriğinin medyanı
 *    (sabitlenmiş ve <3 günlük içerikler ile hedefin kendisi hariç); n<10 → düşük güven.
 *  - lift = views / medyan; kademe eşikleri `LIFT_TIER_MIN`.
 *  - crossScore = ln(views/takipçi) × ln(takipçi) (f<2 → undefined).
 */
import type { AnalysisStatus, ContentAnalysis, Transcript } from "@/lib/domain/intel";
import type { ContentFormat, NormalizedMetrics, Platform, ViewsKind } from "@/lib/platforms/types";

// -------------------------------------------------------------------- Skor

/** 0: <1.5x · 1: ≥1.5x · 2: ≥2x · 3: ≥3x · 4: ≥5x. */
export type LiftTier = 0 | 1 | 2 | 3 | 4;

/** Kademenin alt sınırı (lift). İndeks = kademe. `lib/metrics/lift.ts` bu sabiti kullanır (`tiers.ts` yüzdelik dilim içindir, lift kademesi değil). */
export const LIFT_TIER_MIN = [0, 1.5, 2, 3, 5] as const;

/** "Tutan içerik" (outlier) sayılan en düşük kademe: ≥3x. Tutanlar ekranı, genel bakış ve rakip özetleri bunu kullanır. */
export const OUTLIER_MIN_TIER: LiftTier = 3;

/** Lift değerinden kademe. Sonlu olmayan değer için undefined (ölçülemedi ≠ kademe 0). */
export function liftTierFor(lift: number | undefined): LiftTier | undefined {
  if (lift === undefined || !Number.isFinite(lift)) return undefined;
  let tier: LiftTier = 0;
  for (let i = 1; i < LIFT_TIER_MIN.length; i++) {
    if (lift >= LIFT_TIER_MIN[i]) tier = i as LiftTier;
  }
  return tier;
}

/** `content_items` üzerindeki skor önbelleği. Hesaplanamayan alan undefined (0 değil). */
export interface ContentScore {
  /** Baz çizgisinin hesaplandığı views türü. */
  viewsKind?: ViewsKind;
  /** Medyan views (baz çizgisi). */
  baselineViews?: number;
  /** Baz çizgisine giren içerik sayısı. */
  baselineN?: number;
  lift?: number;
  liftTier?: LiftTier;
  /** baselineN < 10. Ekranda "düşük güven" işareti. */
  lowConfidence: boolean;
  /** Çok yeni (<3 gün): views henüz olgunlaşmadı, lift yanıltıcı olabilir. */
  immature: boolean;
  crossScore?: number;
}

// ----------------------------------------------------------------- İçerik

/** İçeriğin sahibi: kendi hesap XOR rakip (DB'de `social_account_id` XOR `competitor_id`). */
export interface ContentOwner {
  kind: "own" | "competitor";
  /** social_accounts.id ya da competitors.id */
  id: string;
  handle: string;
  displayName?: string;
  followers?: number;
}

/** İçeriğin en son ölçülmüş metrikleri (`content_latest_metrics`). */
export interface LatestMetrics extends NormalizedMetrics {
  /** Bu değerlerin alındığı an. undefined = hiç ölçülmedi. */
  capturedAt?: string;
}

export interface ContentItem {
  id: string;
  workspaceId: string;
  platform: Platform;
  externalId: string;
  shortcode?: string;
  /** Herkese açık permalink. */
  url?: string;
  owner: ContentOwner;
  format: ContentFormat;
  publishedAt?: string;
  caption?: string;
  hashtags: string[];
  durationSec?: number;
  isPinned?: true;
  isPaidPartnership?: boolean;
  /** Normalize sırasında ölçülemeyen alanlar (ör. ["saves", "reach"]). */
  missingFields: string[];
  metrics: LatestMetrics;
  score: ContentScore;
  hasTranscript: boolean;
  /** undefined = hiç analiz edilmedi. */
  analysisStatus?: AnalysisStatus;
  firstSeenAt: string;
}

/** Zaman serisi noktası (`metric_snapshots`). Ölçülemeyen alan yazılmaz. */
export interface MetricSnapshot extends NormalizedMetrics {
  id: string;
  contentItemId: string;
  capturedAt: string;
}

/** Hesap düzeyi zaman serisi (`account_snapshots`); kendi hesap ya da rakip. */
export interface AccountSnapshot {
  id: string;
  subjectKind: "own" | "competitor";
  subjectId: string;
  capturedAt: string;
  followers?: number;
  following?: number;
  postsCount?: number;
  /** Ör. resmi API'den hesap insight'ları (reach, profile_views …). */
  extra: Record<string, number | string | boolean>;
}

/**
 * Baz çizgisi dışında kalan içeriklerin sayacı (aynı hesabın içerikleri arasında). Her içerik yalnız İLK
 * takıldığı kuralda sayılır, sıra: self → otherFormat → pinned → noViews → differentViewsKind → noDate → tooYoung.
 * (`lib/metrics` `BaselineExcluded` ile aynı sayaçlar; `young` = tooYoung, `otherKind` = differentViewsKind.)
 */
export interface BaselineExcludedCounts {
  /** Hedefin kendisi (hedef hesabın listesindeyse 1). */
  self: number;
  /** Farklı formatta içerik. */
  otherFormat: number;
  /** Sabitlenmiş içerik (`isPinned`). */
  pinned: number;
  /** İzlenmesi ölçülemeyen içerik. */
  noViews: number;
  /** Farklı ya da bilinmeyen viewsKind. */
  differentViewsKind: number;
  /** Yayın tarihi bilinmiyor (yaşı doğrulanamaz, sıralanamaz). */
  noDate: number;
  /** 3 günden yeni: izlenme henüz olgunlaşmadı. */
  tooYoung: number;
}

/**
 * "Bu lift neden böyle?" — baz çizgisini oluşturan içerikler ve dışarıda bırakılanlar. Skor önbelleğiyle
 * (`ContentScore`) AYNI hesaplama anından saklanır (Supabase: `content_items.baseline_excluded jsonb` + baz
 * çizgisi içerik kimlikleri); okuma sırasında yeniden hesaplanmaz, yani `medianViews`/`n` aynı kaydın
 * `score.baselineViews`/`baselineN` değerleriyle birebir tutar. `unmeasuredReason`: lift hesaplanamadıysa sebep.
 */
export interface BaselineExplanation {
  viewsKind?: ViewsKind;
  format: ContentFormat;
  /** Hedefin kendi views'ı. */
  targetViews?: number;
  medianViews?: number;
  /** Pencere boyutu (25). */
  windowSize: number;
  n: number;
  lowConfidence: boolean;
  /** Baz çizgisine giren içerikler (yeniden eskiye). */
  basis: { contentItemId: string; views: number; publishedAt?: string }[];
  excluded: BaselineExcludedCounts;
  /** Ölçülemediyse sebep (ör. "aynı formatta 3 içerik var, en az 10 gerekli"). */
  unmeasuredReason?: string;
}

/** Video analizi ekranı (`getContent`). */
export interface ContentDetail {
  item: ContentItem;
  snapshots: MetricSnapshot[];
  baseline: BaselineExplanation;
  transcript?: Transcript;
  analysis?: ContentAnalysis;
}
