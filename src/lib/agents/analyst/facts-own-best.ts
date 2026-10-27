/**
 * Kendi tutanların (saf): son `OWN_BEST_WINDOW_DAYS` günde yayımlanmış, lift'i `OWN_BEST_LIFT_MIN` ve üstü kendi videoların en güçlüleri.
 * Olgu paketi yalnız son haftaya bakınca "en iyi videon" iddiası yanlış çıkıyordu (haftanın en iyisi 1,7x iken hesapta 5,9x'lik video vardı):
 * tutanlar pakete kendi penceresinden girer ve ajan "en iyi/tutan video" demeyi yalnız bunlar için yapabilir. Lift'i ölçülemeyen (`undefined`)
 * ve çok yeni (`immature`: lift henüz oturmadı) video bu listeye GİRMEZ (0 sayılmaz, atlanır).
 */
import type { ContentItem } from "@/lib/domain/content";
import { LIFT_TIER_MIN, OUTLIER_MIN_TIER } from "@/lib/domain/content";
import { DAY_MS } from "@/lib/time";

/** Tutan penceresi (gün). */
export const OWN_BEST_WINDOW_DAYS = 90;
/** "Tutan" eşiği: kademe 3 (≥ 3x) — kendi normalinin üç katı; sistemin tutan (outlier) tanımıyla aynı. */
export const OWN_BEST_LIFT_MIN = LIFT_TIER_MIN[OUTLIER_MIN_TIER];
/** Pakete girecek en çok tutan video. */
export const OWN_BEST_MAX = 5;

export interface OwnBest {
  /** Lift azalan, eşitlikte kimlik; en çok `OWN_BEST_MAX`. */
  top: ContentItem[];
  /** Ölçütü sağlayan TÜM kendi video sayısı (`top` bunun en güçlüleri). */
  total: number;
}

export function ownBestContents(content: readonly ContentItem[], now: Date): OwnBest {
  const sinceMs = now.getTime() - OWN_BEST_WINDOW_DAYS * DAY_MS;
  const qualifying = content.filter((item) => {
    if (item.owner.kind !== "own" || item.score.lift === undefined || item.score.immature === true) return false;
    if (item.score.lift < OWN_BEST_LIFT_MIN) return false;
    const publishedMs = item.publishedAt === undefined ? Number.NaN : Date.parse(item.publishedAt);
    return Number.isFinite(publishedMs) && publishedMs >= sinceMs && publishedMs <= now.getTime();
  });
  qualifying.sort((a, b) => (b.score.lift ?? 0) - (a.score.lift ?? 0) || (a.id < b.id ? -1 : 1));
  return { top: qualifying.slice(0, OWN_BEST_MAX), total: qualifying.length };
}
