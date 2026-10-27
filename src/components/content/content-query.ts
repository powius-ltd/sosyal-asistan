/**
 * İçeriklerim ekranının URL durumu: tipler, seçenekler ve bağlantı üreticileri.
 * Saf modül (istemci filtre çubuğu da kullanır, bu yüzden zod gibi ağır bağımlılık YOK);
 * `searchParams` ayrıştırması `parse-content-query.ts`'tedir.
 *
 * URL parametreleri: hesap, format, gun (7|30|90), sirala (tarih|izlenme|lift),
 * imlec (sayfa imleci), gecmis (önceki sayfaların imleçleri, geri gitmek için).
 */
import type { ContentSort } from "@/lib/data";
import type { ContentFormat } from "@/lib/domain/platform";
import { ROUTES } from "@/lib/routes";
import { CONTENT_PLAIN } from "@/lib/plain-language-publish";
import { DAY_MS } from "@/lib/time";

export const CONTENT_PAGE_SIZE = 25;

export const DATE_RANGE_DAYS = [7, 30, 90] as const;
export type DateRangeDays = (typeof DATE_RANGE_DAYS)[number];

export const SORT_KEYS = ["tarih", "izlenme", "lift"] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export const DEFAULT_SORT: SortKey = "tarih";

export const SORT_LABEL: Record<SortKey, string> = {
  tarih: "En yeni",
  izlenme: "En çok izlenen",
  lift: CONTENT_PLAIN.sortByMultiplier,
};

export const SORT_TO_API: Record<SortKey, ContentSort> = {
  tarih: "recent",
  izlenme: "views",
  lift: "lift",
};

export interface ContentQuery {
  /** social_accounts.id */
  account?: string;
  format?: ContentFormat;
  days?: DateRangeDays;
  sort: SortKey;
  /** Geçerli sayfanın imleci; ilk sayfada yok. */
  cursor?: string;
  /** Önceki sayfaların imleçleri (ilk sayfanın imleci yoktur), eskiden yeniye. */
  history: string[];
}

/** `days` gün önceki an (ISO). Filtrelerde `since` olarak kullanılır; `now` `getPanelContext()`'ten gelir (tek saat). */
export function isoDaysAgo(days: number, now: Date): string {
  return new Date(now.getTime() - days * DAY_MS).toISOString();
}

export function contentHref(query: ContentQuery): string {
  const params = new URLSearchParams();
  if (query.account) params.set("hesap", query.account);
  if (query.format) params.set("format", query.format);
  if (query.days) params.set("gun", String(query.days));
  if (query.sort !== DEFAULT_SORT) params.set("sirala", query.sort);
  if (query.cursor) params.set("imlec", query.cursor);
  if (query.history.length > 0) params.set("gecmis", query.history.map(encodeURIComponent).join(","));
  const qs = params.toString();
  return qs ? `${ROUTES.content}?${qs}` : ROUTES.content;
}

/** Filtre değişince sayfalama sıfırlanır. */
export function withFilters(
  query: ContentQuery,
  patch: Partial<Omit<ContentQuery, "cursor" | "history">>,
): ContentQuery {
  return { ...query, ...patch, cursor: undefined, history: [] };
}

/** Yalnız sıralama korunur; hesap/format/tarih filtreleri kalkar. */
export function clearedFilters(query: ContentQuery): ContentQuery {
  return { sort: query.sort, history: [] };
}

export function hasActiveFilters(query: ContentQuery): boolean {
  return query.account !== undefined || query.format !== undefined || query.days !== undefined;
}

export function nextPageQuery(query: ContentQuery, nextCursor: string): ContentQuery {
  const history = query.cursor ? [...query.history, query.cursor] : query.history;
  return { ...query, cursor: nextCursor, history };
}

/** Bir önceki sayfa; ilk sayfadaysa undefined. */
export function prevPageQuery(query: ContentQuery): ContentQuery | undefined {
  if (!query.cursor) return undefined;
  const history = query.history.slice(0, -1);
  return { ...query, cursor: query.history.at(-1), history };
}

/** 1'den başlar. */
export function pageNumber(query: ContentQuery): number {
  return query.cursor ? query.history.length + 2 : 1;
}
