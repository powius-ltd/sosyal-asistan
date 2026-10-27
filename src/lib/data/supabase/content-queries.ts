/**
 * İçerik okumaları: `listContent` (süzgeç + sıralama + imleçli sayfalama) ve `getContent` (içerik + snapshot serisi +
 * saklanan baz çizgisi açıklaması + transcript + analiz). Her sorgu `workspace_id` süzgeçlidir.
 */
import type { ContentDetail, ContentItem } from "@/lib/domain/content";
import type { ContentFilter, PagedResult } from "@/lib/data/queries";
import { applyContentFilters, resolveSearch } from "@/lib/data/supabase/content-filters";
import { hydrateContent } from "@/lib/data/supabase/content-load";
import { pageContentByViews } from "@/lib/data/supabase/content-views-sort";
import type { SupabaseContext } from "@/lib/data/supabase/context";
import { assertIsoInstant, isUuid, unwrap } from "@/lib/data/supabase/errors";
import { planPage, type PageSort } from "@/lib/data/supabase/keyset";
import {
  CONTENT_SELECT,
  SNAPSHOT_COLUMNS,
  toBaselineExplanation,
  toMetricSnapshot,
  type BaselineStoredRow,
  type ContentRow,
} from "@/lib/data/supabase/mappers/content";
import { ANALYSIS_COLUMNS, TRANSCRIPT_COLUMNS, toContentAnalysis, toTranscript } from "@/lib/data/supabase/mappers/intel";
import { clampLimit, fetchAllRows, pageOf } from "@/lib/data/supabase/paging";
import { maskExpiredTranscript } from "@/lib/data/views/transcript-expiry";

const EMPTY: PagedResult<ContentItem> = { items: [], total: 0 };

/** Veritabanında sayfalanan sıralar (kararlı: `id` ile biter). `views` ayrıdır (`content-views-sort`). */
const SORTS: Record<"recent" | "lift", PageSort> = {
  recent: { tag: "content:recent", column: "published_at", nullable: true, cursor: "keyset" },
  lift: { tag: "content:lift", column: "lift", nullable: true, cursor: "offset" },
};

export async function listContent(ctx: SupabaseContext, wsId: string, filter: ContentFilter = {}): Promise<PagedResult<ContentItem>> {
  if (!isUuid(wsId) || (filter.ownerId !== undefined && !isUuid(filter.ownerId))) return EMPTY;
  assertIsoInstant(filter.since, "başlangıç zamanı (since)");
  const limit = clampLimit(filter.limit);
  const search = await resolveSearch(ctx, wsId, filter.search);
  const base = () => ctx.db.from("content_items");

  if (filter.sort === "views") {
    const ids = await fetchAllRows((from, to) =>
      applyContentFilters(base().select("id").eq("workspace_id", wsId), filter, search).order("id", { ascending: true }).range(from, to),
    );
    return pageContentByViews(ctx, wsId, ids.map((row) => row.id), limit, filter.cursor);
  }

  const sort = SORTS[filter.sort === "lift" ? "lift" : "recent"];
  const plan = planPage<ContentRow>(sort, filter.cursor, limit);
  const rowsQuery = plan.apply(applyContentFilters(base().select(CONTENT_SELECT).eq("workspace_id", wsId), filter, search));
  const countQuery = applyContentFilters(base().select("id", { count: "exact", head: true }).eq("workspace_id", wsId), filter, search);
  const [rows, counted] = await Promise.all([rowsQuery.overrideTypes<ContentRow[], { merge: false }>(), countQuery]);
  const data = unwrap(rows);
  if (counted.error) unwrap(counted);

  const page = pageOf(data, limit, plan.nextCursor(data), counted.count ?? undefined);
  return { ...page, items: await hydrateContent(ctx, wsId, page.items) };
}

/** İçerik + snapshot serisi + baz çizgisi açıklaması + transcript + analiz; yoksa (ya da başka workspace'teyse) null. */
export async function getContent(ctx: SupabaseContext, wsId: string, contentId: string): Promise<ContentDetail | null> {
  if (!isUuid(wsId) || !isUuid(contentId)) return null;
  const { db } = ctx;
  const found = unwrap(
    await db
      .from("content_items")
      .select(`${CONTENT_SELECT}, baseline_excluded, baseline_basis`)
      .eq("workspace_id", wsId)
      .eq("id", contentId)
      .maybeSingle<ContentRow & BaselineStoredRow>(),
  );
  if (!found) return null;

  const [items, snapshots, transcript, analysis] = await Promise.all([
    hydrateContent(ctx, wsId, [found]),
    fetchAllRows((from, to) =>
      db
        .from("metric_snapshots")
        .select(SNAPSHOT_COLUMNS)
        .eq("workspace_id", wsId)
        .eq("content_item_id", contentId)
        .order("captured_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    ),
    db.from("transcripts").select(TRANSCRIPT_COLUMNS).eq("workspace_id", wsId).eq("content_item_id", contentId).maybeSingle(),
    db.from("content_analyses").select(ANALYSIS_COLUMNS).eq("workspace_id", wsId).eq("content_item_id", contentId).maybeSingle(),
  ]);
  const item = items[0];
  const transcriptRow = unwrap(transcript);
  const analysisRow = unwrap(analysis);
  return {
    item,
    snapshots: snapshots.map(toMetricSnapshot),
    baseline: toBaselineExplanation(item, found),
    // Süresi dolan transcript metni purge beklenmeden de görünmez (90 gün kuralı; satır kalır: "süresi doldu").
    transcript: transcriptRow ? maskExpiredTranscript(toTranscript(transcriptRow), ctx.now()) : undefined,
    analysis: analysisRow ? toContentAnalysis(analysisRow) : undefined,
  };
}
