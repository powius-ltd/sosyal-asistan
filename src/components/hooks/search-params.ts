/**
 * Hook kütüphanesi ekranının URL `searchParams` sözleşmesi (saf; sunucu ve istemci ortak kullanır).
 * URL'ye güvenilmez: bilinmeyen/bozuk değer sessizce varsayılana düşer (whitelist). Parametreler:
 * `tur` (hook türü anahtarı), `kademe` (en düşük lift: 1.5 | 2 | 3 | 5), `kaynak` (kendi | rakip; yoksa hepsi),
 * `q` (arama), `sirala` (yeni; yoksa lift), `reklam` (1 = yalnız reklamda denenmiş kendi açılışların; yalnız yönetici + reklam hesabı varken
 * sayfa bunu uygular), `cursor` (sayfa imleci).
 */
import { nextPage, parseTrail, TRAIL_PARAM, writePage, type PageTrail } from "@/components/common/cursor-trail";
import type { HookLibraryFilter, HookLibrarySort } from "@/lib/data/queries";
import { LIFT_TIER_MIN, type LiftTier } from "@/lib/domain/content";
import { ROUTES } from "@/lib/routes";
import { first, type RawSearchParams } from "@/lib/search-params";

export const HOOK_PARAM = {
  type: "tur",
  tier: "kademe",
  source: "kaynak",
  q: "q",
  sort: "sirala",
  ads: "reklam",
  /** Ad, `useUrlParams`'ın filtre değişince sıfırladığı "cursor" ile aynı olmalı. */
  cursor: "cursor",
} as const;

export const HOOK_PAGE_SIZE = 20;

/** Seçilebilir en düşük kademeler (1.5x / 2x / 3x / 5x). */
export const HOOK_TIER_OPTIONS: readonly LiftTier[] = [1, 2, 3, 4];

export type HookSource = "all" | "own" | "competitor";

/** URL değerleri (Türkçe) → kaynak. "Hepsi" URL'de yazılmaz. */
const SOURCE_PARAM: Record<Exclude<HookSource, "all">, string> = { own: "kendi", competitor: "rakip" };

/** Kaynağın URL değeri; "hepsi" için undefined (parametre yazılmaz). */
export function hookSourceToParam(source: HookSource): string | undefined {
  return source === "all" ? undefined : SOURCE_PARAM[source];
}

/** Sıralamanın URL değeri; varsayılan (lift) için undefined. */
export function hookSortToParam(sort: HookLibrarySort): string | undefined {
  return sort === DEFAULT_HOOK_SORT ? undefined : RECENT_PARAM;
}

export const HOOK_SORTS: readonly HookLibrarySort[] = ["lift", "recent"];
export const DEFAULT_HOOK_SORT: HookLibrarySort = "lift";
/** "En yeni" sıralamasının URL değeri. */
const RECENT_PARAM = "yeni";

/** `reklam` parametresinin açık değeri. */
export const ADS_USED_PARAM = "1";

const TYPE_PATTERN = /^[a-z0-9_]{1,40}$/;
const Q_MAX = 100;
const CURSOR_MAX = 200;

export interface HookUiState {
  hookType?: string;
  minTier?: LiftTier;
  source: HookSource;
  /** Hook metni, hesap adı ya da tür etiketinde arama. */
  q?: string;
  sort: HookLibrarySort;
  /** Yalnız reklamda denenmiş (kendi) açılışlar. Süzgeci sayfa uygular (depo sorgusunda yok); yönetici + reklam hesabı yoksa yok sayılır. */
  adsUsed?: true;
  cursor?: string;
  /** Önceki sayfaların imleçleri ("Önceki sayfa" için). */
  trail: string[];
}

/** Kademe → URL değeri: 1 → "1.5", 2 → "2", 3 → "3", 4 → "5" (lift eşiği). */
export function hookTierToParam(tier: LiftTier): string {
  return String(LIFT_TIER_MIN[tier]);
}

export function parseHookParams(raw: RawSearchParams): HookUiState {
  const type = first(raw[HOOK_PARAM.type]);
  const tier = first(raw[HOOK_PARAM.tier]);
  const source = first(raw[HOOK_PARAM.source]);
  const q = first(raw[HOOK_PARAM.q])?.trim();
  const cursor = first(raw[HOOK_PARAM.cursor]);
  return {
    hookType: type && TYPE_PATTERN.test(type) ? type : undefined,
    minTier: HOOK_TIER_OPTIONS.find((option) => hookTierToParam(option) === tier),
    source: source === SOURCE_PARAM.own ? "own" : source === SOURCE_PARAM.competitor ? "competitor" : "all",
    q: q ? q.slice(0, Q_MAX) : undefined,
    sort: first(raw[HOOK_PARAM.sort]) === RECENT_PARAM ? "recent" : DEFAULT_HOOK_SORT,
    cursor: cursor && cursor.length <= CURSOR_MAX ? cursor : undefined,
    trail: cursor ? parseTrail(raw[TRAIL_PARAM]) : [],
    ...(first(raw[HOOK_PARAM.ads]) === ADS_USED_PARAM ? { adsUsed: true as const } : {}),
  };
}

export function toHookFilter(state: HookUiState): HookLibraryFilter {
  return {
    ...(state.hookType ? { hookType: state.hookType } : {}),
    ...(state.minTier !== undefined ? { minTier: state.minTier } : {}),
    ...(state.source !== "all" ? { own: state.source === "own" } : {}),
    ...(state.q ? { q: state.q } : {}),
    sort: state.sort,
    limit: HOOK_PAGE_SIZE,
    ...(state.cursor ? { cursor: state.cursor } : {}),
  };
}

/** Sıralama hariç, sonucu daraltan bir filtre açık mı? (boş durum mesajı ve "temizle" bağlantısı için) */
export function hasActiveHookFilters(state: HookUiState): boolean {
  return state.hookType !== undefined || state.minTier !== undefined || state.source !== "all" || state.q !== undefined || state.adsUsed === true;
}

/** Durumu ve sayfayı URL'ye çevirir; yalnız varsayılandan farklı değerler yazılır (durumdaki imleç `page` ile verilir). */
export function buildHookPageHref(state: HookUiState, page: PageTrail): string {
  const params = new URLSearchParams();
  if (state.hookType) params.set(HOOK_PARAM.type, state.hookType);
  if (state.minTier !== undefined) params.set(HOOK_PARAM.tier, hookTierToParam(state.minTier));
  const source = hookSourceToParam(state.source);
  if (source) params.set(HOOK_PARAM.source, source);
  if (state.q) params.set(HOOK_PARAM.q, state.q);
  const sort = hookSortToParam(state.sort);
  if (sort) params.set(HOOK_PARAM.sort, sort);
  if (state.adsUsed) params.set(HOOK_PARAM.ads, ADS_USED_PARAM);
  writePage(params, page, HOOK_PARAM.cursor);
  const query = params.toString();
  return query ? `${ROUTES.hooks}?${query}` : ROUTES.hooks;
}

/** İlk sayfa (imleç verilmezse) ya da `cursor` ile bir sonraki sayfa (bu sayfanın imleci ize eklenir). */
export function buildHookHref(state: HookUiState, cursor?: string): string {
  return buildHookPageHref(state, cursor === undefined ? { trail: [] } : nextPage(state, cursor));
}

/** Filtreleri temizler; sıralama korunur. */
export function clearedHookFilters(state: HookUiState): HookUiState {
  return { source: "all", sort: state.sort, trail: [] };
}
