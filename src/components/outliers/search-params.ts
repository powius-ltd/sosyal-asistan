/**
 * Tutan içerikler ekranının URL `searchParams` sözleşmesi (saf; sunucu ve istemci ortak kullanır).
 * Bilinmeyen/bozuk değerler sessizce varsayılana düşer — URL'ye güvenilmez, sunucuda whitelist'le okunur.
 */
import { nextPage, parseTrail, TRAIL_PARAM, writePage, type PageTrail } from "@/components/common/cursor-trail";
import type { OutlierFilter, OutlierSort } from "@/lib/data/queries";
import { LIFT_TIER_MIN, type LiftTier } from "@/lib/domain/content";
import { CONTENT_FORMATS, PLATFORMS, type ContentFormat, type Platform } from "@/lib/domain/platform";
import { ROUTES } from "@/lib/routes";
import { first, type RawSearchParams } from "@/lib/search-params";
import { DAY_MS } from "@/lib/time";

export const OUTLIER_PARAM = {
  platform: "platform",
  format: "format",
  minLift: "kademe",
  days: "gun",
  similar: "benzer",
  reliable: "guvenilir",
  mature: "olgun",
  sort: "sirala",
  view: "gorunum",
  cursor: "cursor",
} as const;

export const PAGE_SIZE = 24;
export const DAY_OPTIONS = [7, 30, 90] as const;
export type DayOption = (typeof DAY_OPTIONS)[number];
export const SORT_OPTIONS: readonly OutlierSort[] = ["lift", "cross", "recent"];
export const VIEW_OPTIONS = ["cards", "table"] as const;
export type OutlierView = (typeof VIEW_OPTIONS)[number];

/** Seçilebilir en düşük kademeler (1.5x / 2x / 3x / 5x). Kademe 0 seçilemez. */
export const MIN_TIER_OPTIONS: readonly LiftTier[] = [1, 2, 3, 4];
export const DEFAULT_MIN_TIER: LiftTier = 3;
export const DEFAULT_SORT: OutlierSort = "lift";
export const DEFAULT_VIEW: OutlierView = "cards";

export interface OutlierUiState {
  platform?: Platform;
  format?: ContentFormat;
  minTier: LiftTier;
  days?: DayOption;
  /** Yalnız benzer boy hesapların içerikleri. */
  similar: boolean;
  /** Düşük güvenli (baz çizgisi <10 içerik) skorları gizle. */
  hideLowConfidence: boolean;
  /** 3 günden yeni (olgunlaşmamış) içerikleri gizle. */
  hideImmature: boolean;
  sort: OutlierSort;
  view: OutlierView;
  cursor?: string;
  /** Önceki sayfaların imleçleri ("Önceki sayfa" için). */
  trail: string[];
}

/** Kademe → URL değeri: 1 → "1.5", 2 → "2", 3 → "3", 4 → "5" (lift eşiği). */
export function tierToParam(tier: LiftTier): string {
  return String(LIFT_TIER_MIN[tier]);
}

function tierFromParam(value: string | undefined): LiftTier {
  const found = MIN_TIER_OPTIONS.find((tier) => tierToParam(tier) === value);
  return found ?? DEFAULT_MIN_TIER;
}

export function parseOutlierParams(raw: RawSearchParams): OutlierUiState {
  const days = Number(first(raw[OUTLIER_PARAM.days]));
  const cursor = first(raw[OUTLIER_PARAM.cursor]);
  return {
    platform: PLATFORMS.find((p) => p === first(raw[OUTLIER_PARAM.platform])),
    format: CONTENT_FORMATS.find((f) => f === first(raw[OUTLIER_PARAM.format])),
    minTier: tierFromParam(first(raw[OUTLIER_PARAM.minLift])),
    days: DAY_OPTIONS.find((d) => d === days),
    similar: first(raw[OUTLIER_PARAM.similar]) === "1",
    hideLowConfidence: first(raw[OUTLIER_PARAM.reliable]) === "1",
    hideImmature: first(raw[OUTLIER_PARAM.mature]) === "1",
    sort: SORT_OPTIONS.find((s) => s === first(raw[OUTLIER_PARAM.sort])) ?? DEFAULT_SORT,
    view: VIEW_OPTIONS.find((v) => v === first(raw[OUTLIER_PARAM.view])) ?? DEFAULT_VIEW,
    cursor: cursor && cursor.length <= 200 ? cursor : undefined,
    trail: cursor ? parseTrail(raw[TRAIL_PARAM]) : [],
  };
}

/** `now`: `getPanelContext()`'ten gelen tek saat (testte sabit zaman verilir). */
export function toOutlierFilter(state: OutlierUiState, now: Date): OutlierFilter {
  return {
    ...(state.platform ? { platform: state.platform } : {}),
    ...(state.format ? { format: state.format } : {}),
    minTier: state.minTier,
    ...(state.days ? { since: new Date(now.getTime() - state.days * DAY_MS).toISOString() } : {}),
    ...(state.similar ? { similarSizeOnly: true } : {}),
    ...(state.hideLowConfidence ? { hideLowConfidence: true } : {}),
    ...(state.hideImmature ? { hideImmature: true } : {}),
    sort: state.sort,
    limit: PAGE_SIZE,
    ...(state.cursor ? { cursor: state.cursor } : {}),
  };
}

/** Sıralama/görünüm hariç, sonucu daraltan bir filtre açık mı? (boş durum mesajı için) */
export function hasActiveFilters(state: OutlierUiState): boolean {
  return (
    state.platform !== undefined ||
    state.format !== undefined ||
    state.minTier !== DEFAULT_MIN_TIER ||
    state.days !== undefined ||
    state.similar ||
    state.hideLowConfidence ||
    state.hideImmature
  );
}

/** Durumu ve sayfayı URL'ye çevirir; yalnız varsayılandan farklı değerler yazılır. */
export function buildOutlierPageHref(state: OutlierUiState, page: PageTrail): string {
  const q = new URLSearchParams();
  if (state.platform) q.set(OUTLIER_PARAM.platform, state.platform);
  if (state.format) q.set(OUTLIER_PARAM.format, state.format);
  if (state.minTier !== DEFAULT_MIN_TIER) q.set(OUTLIER_PARAM.minLift, tierToParam(state.minTier));
  if (state.days) q.set(OUTLIER_PARAM.days, String(state.days));
  if (state.similar) q.set(OUTLIER_PARAM.similar, "1");
  if (state.hideLowConfidence) q.set(OUTLIER_PARAM.reliable, "1");
  if (state.hideImmature) q.set(OUTLIER_PARAM.mature, "1");
  if (state.sort !== DEFAULT_SORT) q.set(OUTLIER_PARAM.sort, state.sort);
  if (state.view !== DEFAULT_VIEW) q.set(OUTLIER_PARAM.view, state.view);
  writePage(q, page, OUTLIER_PARAM.cursor);
  const query = q.toString();
  return query ? `${ROUTES.outliers}?${query}` : ROUTES.outliers;
}

/** İlk sayfa (imleç verilmezse) ya da `cursor` ile bir sonraki sayfa (bu sayfanın imleci ize eklenir). */
export function buildOutlierHref(state: OutlierUiState, cursor?: string): string {
  return buildOutlierPageHref(state, cursor === undefined ? { trail: [] } : nextPage(state, cursor));
}
