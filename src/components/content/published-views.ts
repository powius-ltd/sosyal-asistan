/**
 * İçeriklerim "yayın tarihine göre izlenme" grafiğinin verisi (saf). Geçmiş ölçüm (zaman serisi) henüz birikmediği için her
 * nokta bir videodur: yatay eksen yayın tarihi, dikey eksen son ölçülen izlenme, renk lift kademesi. Ölçülemeyen video
 * (yayın tarihi ya da izlenme yok) grafiğe 0 olarak girmez: dışarıda bırakılır ve sayısı ayrıca söylenir (`undefined ≠ 0`).
 */
import { contentTitle } from "@/components/content/content-title";
import { liftTierFor, LIFT_TIER_MIN, type ContentItem, type LiftTier } from "@/lib/domain/content";
import { tierLegendPlain } from "@/lib/plain-language-publish";

/** Grafikte gösterilen en çok video (listeleme üst sınırı 200; en yeniler tutulur). */
export const PUBLISHED_CHART_MAX_ITEMS = 200;

export interface PublishedViewsPoint {
  contentItemId: string;
  /** Yayın anı (ms, UTC). */
  t: number;
  views: number;
  lift?: number;
  /** Lift kademesi; lift ölçülemediyse undefined (kademe 0 ile karışmaz). */
  tier?: LiftTier;
  title: string;
  handle: string;
}

export interface PublishedViewsData {
  points: PublishedViewsPoint[];
  /** Yayın tarihi ya da izlenmesi ölçülemediği için grafikte olmayan video sayısı. */
  excluded: number;
}

export function buildPublishedViewsData(items: readonly ContentItem[]): PublishedViewsData {
  const points: PublishedViewsPoint[] = [];
  for (const item of items) {
    const t = item.publishedAt === undefined ? Number.NaN : Date.parse(item.publishedAt);
    const views = item.metrics.views;
    if (!Number.isFinite(t) || views === undefined || !Number.isFinite(views)) continue;
    points.push({
      contentItemId: item.id,
      t,
      views,
      lift: item.score.lift,
      tier: item.score.liftTier ?? liftTierFor(item.score.lift),
      title: contentTitle(item),
      handle: item.owner.handle,
    });
  }
  points.sort((a, b) => a.t - b.t);
  return { points, excluded: items.length - points.length };
}

/**
 * Kademe renkleri `LiftBadge` ile aynı ailedir (gri → mavi → yeşil → amber → gül). Sınıflar düz metin olmalı (Tailwind
 * kaynağı tarar): `fill-*` SVG noktası, `bg-*` açıklama satırındaki nokta içindir.
 */
export const TIER_FILL: Record<LiftTier, string> = {
  0: "fill-muted-foreground/45",
  1: "fill-tier-1-solid",
  2: "fill-tier-2-solid",
  3: "fill-tier-3-solid",
  4: "fill-tier-4-solid",
};
export const UNMEASURED_FILL = "fill-transparent stroke-muted-foreground";
export const UNMEASURED_DOT = "border border-muted-foreground bg-transparent";

export const TIER_DOT: Record<LiftTier, string> = {
  0: "bg-muted-foreground/45",
  1: "bg-tier-1-solid",
  2: "bg-tier-2-solid",
  3: "bg-tier-3-solid",
  4: "bg-tier-4-solid",
};

/** Açıklama satırı: kademe → düz cümle ("normalinin 1,5 katı ve üstü"); kademe 0 için "normalinin 1,5 katından az". */
export function tierLegendLabel(tier: LiftTier): string {
  return tierLegendPlain(tier, LIFT_TIER_MIN[tier === 0 ? 1 : tier]);
}

export function pointFillClass(tier: LiftTier | undefined): string {
  return tier === undefined ? UNMEASURED_FILL : TIER_FILL[tier];
}
