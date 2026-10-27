/**
 * Hesabın tüm metriklerini tek pakete toplar — Python `core/metrics/package.py` paritesi.
 *
 * Bu paket LLM'e (sentez/fikir) ve rapora giden TEK sayı kaynağıdır: rapordaki her sayı buradan
 * gelir, istemde ya da şablonda sayı türetilmez. Hesaplanamayan alan undefined kalır.
 *
 * Python → TS eşlemesi: posts = image + carousel, reels = short_video, combined = tüm içerik
 * (long_video/story yalnız genel toplamda ve format kırılımında). Anahtarlar camelCase.
 * Ekler (Python'da yok): `timeZone`, `bestHours`, `correlations.durationVsViews`.
 */
import { DEFAULT_TIMEZONE } from "@/lib/format";
import {
  captionLengthCorrelation,
  durationViewsCorrelation,
  hashtagCountCorrelation,
  hashtagFrequency,
  type Correlation,
  type HashtagStat,
} from "@/lib/metrics/content";
import {
  benchmarkBand,
  computeEngagementStats,
  computeFormatBreakdown,
  computeReelPlayRate,
  type BenchmarkBand,
  type EngagementStats,
  type FormatBreakdown,
  type PlayRate,
} from "@/lib/metrics/engagement";
import {
  bestPostingHours,
  computeCadence,
  computeHeatmap,
  computeTrend,
  type CadenceStats,
  type Heatmap,
  type HourStat,
  type TrendComparison,
} from "@/lib/metrics/temporal";
import { assignTiers, type TieredItem } from "@/lib/metrics/tiers";
import type { MetricItem } from "@/lib/metrics/types";
import type { ViewsKind } from "@/lib/platforms/types";

export interface AccountPackageInput {
  handle: string;
  followers?: number;
  /** Normalize sırasında ölçülemeyen alanlar (Python `missing_fields`). */
  missingFields?: string[];
  items: readonly MetricItem[];
  /** Toplanan yorum sayısı (Python `sample_sizes.comments`); bilinmiyorsa undefined. */
  commentsCount?: number;
  /** Gün/saat analizleri için workspace saat dilimi. */
  timeZone?: string;
}

export interface AccountPackage {
  handle: string;
  followers?: number;
  missingFields: string[];
  timeZone: string;
  engagement: { overall: EngagementStats; posts: EngagementStats; reels: EngagementStats };
  formatBreakdown: FormatBreakdown[];
  reelPlayRate: PlayRate[];
  benchmark?: BenchmarkBand;
  cadence: CadenceStats;
  heatmap: Heatmap;
  bestHours: HourStat[];
  trend: { last30Days: TrendComparison; last90Days: TrendComparison };
  correlations: {
    captionLengthVsEngagement: Correlation;
    hashtagCountVsEngagement: Correlation;
    /** Kısa videolarda süre ↔ views, viewsKind başına. */
    durationVsViews: (Correlation & { viewsKind: ViewsKind })[];
  };
  /** Medyan etkileşime göre ilk 15 etiket. */
  topHashtags: HashtagStat[];
  sampleSizes: {
    posts: number;
    reels: number;
    comments?: number;
    postTiersComputed: number;
    reelTiersComputed: number;
  };
}

function isPost(it: MetricItem): boolean {
  return it.format === "image" || it.format === "carousel";
}

function isReel(it: MetricItem): boolean {
  return it.format === "short_video";
}

/** İçeriklerde görülen viewsKind'lar (ilk görülme sırasıyla). */
function viewsKindsOf(items: readonly MetricItem[]): ViewsKind[] {
  const kinds = new Set<ViewsKind>();
  for (const it of items) if (it.viewsKind !== undefined && it.views !== undefined) kinds.add(it.viewsKind);
  return [...kinds];
}

export function buildAccountPackage(input: AccountPackageInput): AccountPackage {
  const { followers, items } = input;
  const timeZone = input.timeZone ?? DEFAULT_TIMEZONE;
  const posts = items.filter(isPost);
  const reels = items.filter(isReel);

  return {
    handle: input.handle,
    followers,
    missingFields: input.missingFields ?? [],
    timeZone,
    engagement: {
      overall: computeEngagementStats(items, followers),
      posts: computeEngagementStats(posts, followers),
      reels: computeEngagementStats(reels, followers),
    },
    formatBreakdown: computeFormatBreakdown(items, followers),
    reelPlayRate: computeReelPlayRate(reels, followers),
    benchmark: benchmarkBand(followers),
    cadence: computeCadence(items),
    heatmap: computeHeatmap(items, timeZone),
    bestHours: bestPostingHours(items, { timeZone }),
    trend: {
      last30Days: computeTrend(items, followers, { windowDays: 30 }),
      last90Days: computeTrend(items, followers, { windowDays: 90 }),
    },
    correlations: {
      captionLengthVsEngagement: captionLengthCorrelation(items),
      hashtagCountVsEngagement: hashtagCountCorrelation(items),
      durationVsViews: viewsKindsOf(reels).map((k) => ({ ...durationViewsCorrelation(reels, k), viewsKind: k })),
    },
    topHashtags: hashtagFrequency(items).slice(0, 15),
    sampleSizes: {
      posts: posts.length,
      reels: reels.length,
      comments: input.commentsCount,
      postTiersComputed: assignTiers(posts).length,
      reelTiersComputed: assignTiers(reels).length,
    },
  };
}

/**
 * Ajanlara giden dilim etiketli içerik (Python `get_tiered_content`). Sayı paketinden ayrı
 * tutulur: metin/URL taşıyan içerik sayı paketine karışmaz. views dilimleri viewsKind başına.
 */
export function tieredContent<T extends MetricItem>(
  items: readonly T[],
): {
  posts: TieredItem<T>[];
  reels: TieredItem<T>[];
  reelsByViews: { viewsKind: ViewsKind; tiers: TieredItem<T>[] }[];
} {
  const posts = items.filter(isPost);
  const reels = items.filter(isReel);
  return {
    posts: assignTiers(posts),
    reels: assignTiers(reels),
    reelsByViews: viewsKindsOf(reels).map((viewsKind) => ({
      viewsKind,
      tiers: assignTiers(reels, { metric: "views", viewsKind }),
    })),
  };
}
