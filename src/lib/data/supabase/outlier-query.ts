/**
 * Tutan içerikler (`listOutliers`): yalnız İZLENEN (`tracked`) rakiplerin skorlu içerikleri (varsayılan kademe ≥ 3).
 * Rakip durumu sorguda ilişkiyle (`competitors!inner`) süzülür: durum değişince sonuç hemen değişir. Genel bakış ve
 * haftalık özet AYNI süzgeci kullanır (`applyOutlierFilters`): ekranlar arasında sayı çelişmez.
 */
import { OUTLIER_MIN_TIER, type ContentItem } from "@/lib/domain/content";
import type { OutlierFilter, PagedResult } from "@/lib/data/queries";
import { isSimilarSize } from "@/lib/data/mock/mock-filters";
import { applySharedContentFilters, type Filterable } from "@/lib/data/supabase/content-filters";
import { hydrateContent } from "@/lib/data/supabase/content-load";
import type { SupabaseContext } from "@/lib/data/supabase/context";
import { fetchCompetitorRows } from "@/lib/data/supabase/competitor-rows";
import { assertIsoInstant, isUuid, unwrap } from "@/lib/data/supabase/errors";
import { planPage, type PageSort } from "@/lib/data/supabase/keyset";
import { CONTENT_SELECT, type ContentRow } from "@/lib/data/supabase/mappers/content";
import { clampLimit, pageOf } from "@/lib/data/supabase/paging";
import { listOwnAccounts } from "@/lib/data/supabase/workspace";

const EMPTY: PagedResult<ContentItem> = { items: [], total: 0 };

/** Sıralar: `lift` (varsayılan), `cross`, `recent`; hepsi `desc nulls last, id`. */
const SORTS: Record<NonNullable<OutlierFilter["sort"]>, PageSort> = {
  lift: { tag: "outlier:lift", column: "lift", nullable: true, cursor: "offset" },
  cross: { tag: "outlier:cross", column: "cross_score", nullable: true, cursor: "offset" },
  recent: { tag: "outlier:recent", column: "published_at", nullable: true, cursor: "keyset" },
};

/** Tutan süzgeci: izlenen rakip + kademe (varsayılan `OUTLIER_MIN_TIER`) + ortak süzgeçler + rakip. */
export function applyOutlierFilters<Q extends Filterable>(query: Q, f: OutlierFilter, similarCompetitorIds: string[] | undefined): Q {
  let q = applySharedContentFilters(query, { ...f, minTier: f.minTier ?? OUTLIER_MIN_TIER });
  q = q.eq("competitors.status", "tracked");
  if (f.competitorId) q = q.eq("competitor_id", f.competitorId);
  if (similarCompetitorIds) q = q.in("competitor_id", similarCompetitorIds);
  return q;
}

/** Benzer boy: takipçisi, aynı platformdaki kendi hesaplardan birinin ±3x aralığında olan izlenen rakip kimlikleri. */
async function similarSizeCompetitorIds(ctx: SupabaseContext, wsId: string): Promise<string[]> {
  const [ownAccounts, tracked] = await Promise.all([listOwnAccounts(ctx, wsId), fetchCompetitorRows(ctx, wsId, { statuses: ["tracked"] })]);
  return tracked
    .filter((c) => isSimilarSize(c.followers ?? undefined, c.platform, ownAccounts) === true)
    .map((c) => c.id);
}

export async function listOutliers(ctx: SupabaseContext, wsId: string, filter: OutlierFilter = {}): Promise<PagedResult<ContentItem>> {
  if (!isUuid(wsId) || (filter.competitorId !== undefined && !isUuid(filter.competitorId))) return EMPTY;
  assertIsoInstant(filter.since, "başlangıç zamanı (since)");
  const limit = clampLimit(filter.limit);
  let similar: string[] | undefined;
  if (filter.similarSizeOnly) {
    similar = await similarSizeCompetitorIds(ctx, wsId);
    if (similar.length === 0) return EMPTY;
  }

  const sort = SORTS[filter.sort ?? "lift"];
  const base = () => ctx.db.from("content_items");
  const inner = `${CONTENT_SELECT}, competitors!inner(status)`;
  const plan = planPage<ContentRow>(sort, filter.cursor, limit);
  const rowsQuery = plan.apply(applyOutlierFilters(base().select(inner).eq("workspace_id", wsId), filter, similar));
  const countQuery = applyOutlierFilters(base().select("id, competitors!inner(status)", { count: "exact", head: true }).eq("workspace_id", wsId), filter, similar);
  const [rows, counted] = await Promise.all([rowsQuery.overrideTypes<ContentRow[], { merge: false }>(), countQuery]);
  const data = unwrap(rows);
  if (counted.error) unwrap(counted);

  const page = pageOf(data, limit, plan.nextCursor(data), counted.count ?? undefined);
  return { ...page, items: await hydrateContent(ctx, wsId, page.items) };
}
