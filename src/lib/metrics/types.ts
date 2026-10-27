/**
 * Metrik modülünün girdi/çıktı tipleri. Ölçülemeyen alan `undefined` (0 değil).
 */
import type { ContentScore } from "@/lib/domain/content";
import type { ContentFormat, ViewsKind } from "@/lib/platforms/types";

/** Baz çizgisi + lift + cross score için gereken asgari içerik şekli. */
export interface ScorableItem {
  id: string;
  format: ContentFormat;
  publishedAt?: Date;
  /** Yalnız `true` = sabitlenmiş. undefined = bilinmiyor (baz çizgisine dahil edilir). */
  isPinned?: true;
  views?: number;
  /** Farklı viewsKind'lar karıştırılmaz; bilinmeyen viewsKind hiçbir baz çizgisine girmez. */
  viewsKind?: ViewsKind;
}

/**
 * Python `core.metrics.common.ContentItem` karşılığı: etkileşim / zaman / içerik metrikleri için.
 * Python `play_count` ↔ `views` (+ `viewsKind`), `kind` ↔ `format` (reel ↔ short_video),
 * `timestamp` ↔ `publishedAt`, `duration` ↔ `durationSec`.
 */
export interface MetricItem extends ScorableItem {
  likes?: number;
  comments?: number;
  caption?: string;
  hashtags?: string[];
  durationSec?: number;
}

/**
 * Baz çizgisi dışında kalanların sayısı. Her içerik yalnız İLK takıldığı kuralda sayılır
 * (sıra: self → otherFormat → pinned → noViews → otherKind → noDate → young).
 */
export interface BaselineExcluded {
  /** Hedefin kendisi. */
  self: number;
  otherFormat: number;
  /** `isPinned === true`. */
  pinned: number;
  /** views ölçülemedi. */
  noViews: number;
  /** Farklı ya da bilinmeyen viewsKind. */
  otherKind: number;
  /** Yayın tarihi bilinmiyor: yaşı doğrulanamaz ve sıralanamaz. */
  noDate: number;
  /** `minAgeDays`'ten (3) yeni: views henüz olgunlaşmadı. */
  young: number;
}

/** Baz çizgisine giren içerik (yeniden eskiye sıralı). */
export interface BaselineBasisEntry {
  id: string;
  views: number;
  publishedAt: Date;
}

export interface BaselineResult {
  /** Medyan views; n = 0 → undefined. */
  median?: number;
  n: number;
  /** n < minN (10). */
  lowConfidence: boolean;
  basis: BaselineBasisEntry[];
  excluded: BaselineExcluded;
}

/** Bir içeriğin skoru — `content_items` skor önbelleğiyle (`ContentScore`) birebir aynı şekil. */
export type ItemScore = ContentScore;
