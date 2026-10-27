/**
 * Koşular (`collection_runs`), maliyet özeti ve "Ölçülemeyenler". Koşuları Apify/LLM/STT/Graph API her paralı (ya da
 * ücretsiz) çağrı için sunucu yazar (`reserve_budget`); burada yalnız okunur.
 */
import type { CostSummary, CollectionRun } from "@/lib/domain/run";
import type { UnmeasuredEntry } from "@/lib/domain/measured";
import type { PagedResult, RunFilter } from "@/lib/data/queries";
import { buildUnmeasured } from "@/lib/data/mock/views/unmeasured";
import type { Filterable } from "@/lib/data/supabase/content-filters";
import { hydrateContent } from "@/lib/data/supabase/content-load";
import type { SupabaseContext } from "@/lib/data/supabase/context";
import { getCostSummary as summarizeCosts } from "@/lib/data/supabase/cost";
import { fetchCompetitorRows } from "@/lib/data/supabase/competitor-rows";
import { assertIsoInstant, isUuid, unwrap } from "@/lib/data/supabase/errors";
import { planPage, type PageSort } from "@/lib/data/supabase/keyset";
import { toCompetitor } from "@/lib/data/supabase/mappers/accounts";
import { CONTENT_SELECT, type ContentRow } from "@/lib/data/supabase/mappers/content";
import { RUN_COLUMNS, toCollectionRun, type RunRow } from "@/lib/data/supabase/mappers/runs";
import { clampLimit, fetchAllRows, pageOf } from "@/lib/data/supabase/paging";
import { listOwnAccounts, requireWorkspace } from "@/lib/data/supabase/workspace";

/** Yeniden eskiye; eşitlikte kimlik azalan. */
const SORT: PageSort = { tag: "runs", column: "started_at", nullable: false, cursor: "keyset", idDir: "desc" };

const asArray = <T>(value: T | T[] | undefined): T[] | undefined => (value === undefined ? undefined : Array.isArray(value) ? value : [value]);

export async function listRuns(ctx: SupabaseContext, wsId: string, filter: RunFilter = {}): Promise<PagedResult<CollectionRun>> {
  if (!isUuid(wsId)) return { items: [], total: 0 };
  assertIsoInstant(filter.since, "başlangıç zamanı (since)");
  const limit = clampLimit(filter.limit);
  const statuses = asArray(filter.status);
  const scoped = <Q extends Filterable>(query: Q): Q => {
    let q = query;
    if (filter.provider) q = q.eq("provider", filter.provider);
    if (statuses) q = q.in("status", statuses);
    if (filter.since) q = q.gte("started_at", filter.since);
    return q;
  };
  const base = () => ctx.db.from("collection_runs");
  const plan = planPage<RunRow>(SORT, filter.cursor, limit);
  const [rows, counted] = await Promise.all([
    plan.apply(scoped(base().select(RUN_COLUMNS).eq("workspace_id", wsId))),
    scoped(base().select("id", { count: "exact", head: true }).eq("workspace_id", wsId)),
  ]);
  const data = unwrap(rows);
  if (counted.error) unwrap(counted);
  const page = pageOf<RunRow>(data, limit, plan.nextCursor(data), counted.count ?? undefined);
  return { ...page, items: page.items.map(toCollectionRun) };
}

/** `month` = "YYYY-MM"; verilmezse içinde bulunulan ay (workspace saat diliminde). Bilinmeyen workspace → `not_found`. */
export async function getCostSummary(ctx: SupabaseContext, wsId: string, month?: string): Promise<CostSummary> {
  return summarizeCosts(ctx, await requireWorkspace(ctx, wsId), month);
}

/**
 * Ölçülemeyenler: bağlı olmayan hesaplar, gizli/bulunamayan rakipler ve eksik profil alanları, eksik metrik alanı olan
 * içerikler (hesap + alan başına tek satır), başarısız/fiyatı bilinmeyen/mutabık olmayan koşular. Satırlar mock ile AYNI
 * fonksiyondan (`buildUnmeasured`) gelir; yalnız girdi kümesi SQL'de daraltılır (eksik alanlı içerik, sorunlu koşu).
 */
export async function listUnmeasured(ctx: SupabaseContext, wsId: string): Promise<UnmeasuredEntry[]> {
  if (!isUuid(wsId)) return [];
  const { db } = ctx;
  const [own, competitors, contentRows, runs] = await Promise.all([
    listOwnAccounts(ctx, wsId),
    fetchCompetitorRows(ctx, wsId),
    fetchAllRows((from, to) =>
      db
        .from("content_items")
        .select(CONTENT_SELECT)
        .eq("workspace_id", wsId)
        .not("missing_fields", "eq", "{}")
        .order("id", { ascending: true })
        .range(from, to)
        .overrideTypes<ContentRow[], { merge: false }>(),
    ),
    fetchAllRows((from, to) =>
      db
        .from("collection_runs")
        .select(RUN_COLUMNS)
        .eq("workspace_id", wsId)
        // Mutabık olmayan = ücretli koşuda gerçek tutar yok ya da (Apify) henüz kesinleşmedi; abonelikte tutar hiç yoktur.
        .or("status.in.(failed,timed_out,aborted),price_unknown.eq.true,and(billing.eq.metered,status.in.(succeeded,ingested),or(actual_usd.is.null,usage_settled_at.is.null))")
        .order("started_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to),
    ),
  ]);
  const items = await hydrateContent(ctx, wsId, contentRows);
  return buildUnmeasured(
    own,
    competitors.map((row) => toCompetitor(row, 0)),
    items,
    runs.map(toCollectionRun),
  );
}
