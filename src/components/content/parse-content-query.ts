/** `/icerikler` searchParams'ını doğrulayıp `ContentQuery`'ye çevirir; geçersiz değer sessizce yok sayılır. */
import { z } from "zod";

import type { ContentFilter } from "@/lib/data";
import { PUBLISHED_CHART_MAX_ITEMS } from "@/components/content/published-views";
import { CONTENT_FORMATS } from "@/lib/domain/platform";
import { first, type RawSearchParams } from "@/lib/search-params";
import {
  CONTENT_PAGE_SIZE,
  DATE_RANGE_DAYS,
  DEFAULT_SORT,
  isoDaysAgo,
  SORT_KEYS,
  SORT_TO_API,
  type ContentQuery,
} from "@/components/content/content-query";

const MAX_HISTORY = 100;

const schema = z.object({
  hesap: z.string().min(1).max(120).optional().catch(undefined),
  format: z.enum(CONTENT_FORMATS).optional().catch(undefined),
  gun: z
    .enum(DATE_RANGE_DAYS.map(String) as [string, ...string[]])
    .optional()
    .catch(undefined),
  sirala: z.enum(SORT_KEYS).optional().catch(undefined),
  imlec: z.string().min(1).max(200).optional().catch(undefined),
  gecmis: z.string().max(4000).optional().catch(undefined),
});

function safeDecode(token: string): string | undefined {
  try {
    return decodeURIComponent(token) || undefined;
  } catch {
    return undefined;
  }
}

/** `accountIds`: geçerli kendi hesap kimlikleri; bilinmeyen hesap filtresi düşer. */
export function parseContentQuery(raw: RawSearchParams, accountIds: readonly string[]): ContentQuery {
  const p = schema.parse({
    hesap: first(raw.hesap),
    format: first(raw.format),
    gun: first(raw.gun),
    sirala: first(raw.sirala),
    imlec: first(raw.imlec),
    gecmis: first(raw.gecmis),
  });

  const history = (p.gecmis ?? "")
    .split(",")
    .map(safeDecode)
    .filter((token): token is string => token !== undefined)
    .slice(0, MAX_HISTORY);

  return {
    account: p.hesap && accountIds.includes(p.hesap) ? p.hesap : undefined,
    format: p.format,
    days: p.gun ? (Number(p.gun) as ContentQuery["days"]) : undefined,
    sort: p.sirala ?? DEFAULT_SORT,
    cursor: p.imlec,
    // İmleç yokken geçmiş anlamsız (ilk sayfa).
    history: p.imlec ? history : [],
  };
}

/** Yalnız kendi hesap içerikleri; tarih aralığı `now`'a göre `since`'e çevrilir (`now`: `getPanelContext()`, tek saat). */
export function toContentFilter(query: ContentQuery, now: Date): ContentFilter {
  return {
    ownerKind: "own",
    ownerId: query.account,
    format: query.format,
    since: query.days ? isoDaysAgo(query.days, now) : undefined,
    sort: SORT_TO_API[query.sort],
    limit: CONTENT_PAGE_SIZE,
    cursor: query.cursor,
  };
}

/**
 * "Yayın tarihine göre izlenme" grafiğinin okuması: listeyle AYNI filtreler (hesap, format, tarih) ama sayfalamasız ve
 * en yeni `PUBLISHED_CHART_MAX_ITEMS` içerik (grafik bütün filtreyi gösterir, yalnız o sayfayı değil).
 */
export function toChartFilter(query: ContentQuery, now: Date): ContentFilter {
  return { ...toContentFilter({ ...query, cursor: undefined }, now), sort: "recent", limit: PUBLISHED_CHART_MAX_ITEMS };
}
