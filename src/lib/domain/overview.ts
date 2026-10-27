/**
 * Genel bakış ekranı (`getOverview`) sonuç modeli: KPI'lar + trend serileri +
 * son outlier'lar + maliyet özeti.
 */
import type { ContentItem } from "@/lib/domain/content";
import type { CostSummary } from "@/lib/domain/run";

/**
 * Etkileşim oranı göstergesinin adı — TEK yerde. Tanım: içerik başına (likes + comments) / takipçi; gösterge son
 * `days` günde yayınlanan içeriklerin MEDYANI (`lib/metrics` `medianEngagementRate`). Beğeni ya da yorumu ölçülemeyen
 * ve takipçisi bilinmeyen içerik hariç; pay ve payda aynı içerik kümesinden.
 */
export const ENGAGEMENT_RATE_LABEL = "Medyan etkileşim oranı (takipçiye göre)";

export type KpiKey =
  | "followers"
  | "views"
  | "engagement_rate"
  | "posts"
  | "tracked_competitors"
  | "outliers";

export type KpiUnit = "count" | "percent" | "seconds" | "usd";

export interface Kpi {
  key: KpiKey;
  label: string;
  unit: KpiUnit;
  /** undefined = ölçülemedi (0 değil). "percent" biriminde 0..1 oran. */
  value?: number;
  /** Bir önceki eşdeğer dönemin değeri (karşılaştırma). */
  previous?: number;
  /** value undefined ise sebep (tooltip'te gösterilir). */
  unmeasuredReason?: string;
}

export interface TrendPoint {
  /** YYYY-MM-DD (workspace saat diliminde). */
  date: string;
  /** undefined = o gün ölçülemedi (grafikte boşluk; 0 çizilmez). */
  value?: number;
}

export interface TrendSeries {
  key: "followers" | "views" | "engagement_rate";
  label: string;
  unit: KpiUnit;
  points: TrendPoint[];
}

/** En iyi paylaşım dilimi aramasının geriye bakış süresi (gün); `days` dönemi bundan bağımsızdır (30 gün dilim başına çok seyrek). */
export const BEST_TIMES_LOOKBACK_DAYS = 90;

/** `Overview.bestTimes`'ta en çok kaç dilim döner. */
export const BEST_TIMES_LIMIT = 3;

/**
 * Kendi kısa videolarının medyan izlenmesine göre iyi paylaşım dilimi (workspace saat diliminde). Dilim = gün × saat;
 * en az 3 paylaşımlı dilimler (`lib/metrics` `bestPostingSlots`).
 */
export interface BestTime {
  /** Pzt = 0 … Paz = 6 (`WEEKDAY_LABELS` sırası). */
  weekday: number;
  /** 0–23, workspace saat diliminde. */
  hour: number;
  /** Bu dilimdeki kısa videoların medyan izlenmesi; ölçülemiyorsa undefined (0 değil). */
  medianViews?: number;
  /** Dilimde yayınlanıp medyana giren video sayısı (küçük n = düşük güven). */
  n: number;
}

export interface Overview {
  /** Hesaplanan dönem (gün). */
  days: number;
  kpis: Kpi[];
  trends: TrendSeries[];
  /** Son dönemde yakalanan en yüksek lift'li rakip içerikleri (yalnız izlenen `tracked` rakipler; `listOutliers` ile aynı küme). */
  recentOutliers: ContentItem[];
  cost: CostSummary;
  /**
   * En iyi paylaşım dilimleri (en çok `BEST_TIMES_LIMIT`, medyan izlenmeye göre azalan). Kapsam `accountId`/`platform`
   * süzgecidir; `days` dönemini kullanmaz (son `BEST_TIMES_LOOKBACK_DAYS` gün). Yeterli veri yoksa undefined (boş
   * liste ya da 0 değil) ve sebep `bestTimesUnmeasuredReason`'dadır.
   */
  bestTimes?: BestTime[];
  bestTimesUnmeasuredReason?: string;
}
