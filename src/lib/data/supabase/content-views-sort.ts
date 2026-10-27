/**
 * `sort: "views"` — izlenme, `metric_snapshots`'ta (içerik başına EN SON ölçüm) durduğu için PostgREST'te sıralanamaz
 * (görünümle ilişki yok). Bu yüzden: süzgece uyan kimlikler + tüm workspace'in son izlenmeleri okunur, TS'te
 * `views desc nulls last, id` sıralanır ve imleç bu sıra üzerinde (keyset) ilerler. Maliyet süzgece uyan içerik
 * sayısıyla doğrusaldır (1000 içerik ≈ 2 istek); yalnız bu sıralamada geçerlidir, diğer sıralar veritabanında sayfalanır.
 */
import type { ContentItem } from "@/lib/domain/content";
import type { SupabaseContext } from "@/lib/data/supabase/context";
import { decodeCursor, encodeCursor } from "@/lib/data/supabase/cursor";
import { unwrap } from "@/lib/data/supabase/errors";
import { RepositoryError } from "@/lib/data/repository";
import type { PagedResult } from "@/lib/data/queries";
import { hydrateContent } from "@/lib/data/supabase/content-load";
import { CONTENT_SELECT, type ContentRow } from "@/lib/data/supabase/mappers/content";
import { fetchAllRows, inChunks, pageOf } from "@/lib/data/supabase/paging";

const TAG = "views";

interface Ranked {
  id: string;
  views: number | null;
}

/** `views desc nulls last, id asc` karşılaştırıcısı. */
function compareRanked(a: Ranked, b: Ranked): number {
  if (a.views !== b.views) {
    if (a.views === null) return 1;
    if (b.views === null) return -1;
    return b.views - a.views;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * @param candidateIds süzgece uyan içerik kimlikleri (çağıran süzgeci uygulayıp okur)
 */
export async function pageContentByViews(
  ctx: SupabaseContext,
  wsId: string,
  candidateIds: readonly string[],
  limit: number,
  cursor: string | undefined,
): Promise<PagedResult<ContentItem>> {
  const wanted = new Set(candidateIds);
  const latest = await fetchAllRows((from, to) =>
    ctx.db
      .from("content_latest_metrics")
      .select("content_item_id, views")
      .eq("workspace_id", wsId)
      .order("content_item_id", { ascending: true })
      .range(from, to),
  );
  const viewsById = new Map(latest.map((row) => [row.content_item_id, row.views] as const));
  const ranked: Ranked[] = candidateIds.map((id) => ({ id, views: viewsById.get(id) ?? null })).sort(compareRanked);

  let start = 0;
  if (cursor) {
    const [views, id] = decodeCursor(cursor, TAG, 2);
    if ((views !== null && typeof views !== "number") || typeof id !== "string") throw new RepositoryError("invalid_input", "Geçersiz sayfa imleci.");
    const after: Ranked = { id, views };
    start = ranked.findIndex((entry) => compareRanked(entry, after) > 0);
    if (start < 0) start = ranked.length;
  }
  const pageIds = ranked.slice(start, start + limit + 1);
  const total = wanted.size;

  const visible = pageIds.slice(0, limit);
  const rows = await inChunks(visible.map((r) => r.id), async (part) =>
    unwrap(await ctx.db.from("content_items").select(CONTENT_SELECT).eq("workspace_id", wsId).in("id", part).overrideTypes<ContentRow[], { merge: false }>()),
  );
  const byId = new Map(rows.map((row) => [row.id, row]));
  const ordered = visible.flatMap((r) => (byId.has(r.id) ? [byId.get(r.id) as ContentRow] : []));
  const items = await hydrateContent(ctx, wsId, ordered);
  const last = visible[visible.length - 1];
  const next = pageIds.length > limit && last ? encodeCursor(TAG, [last.views, last.id]) : undefined;
  const page = pageOf(pageIds, limit, next, total);
  return { items, total: page.total, ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}) };
}
