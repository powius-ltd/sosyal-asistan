/**
 * Rakip özet istatistikleri (`contentCount`, `followersDelta7d`, `medianViews`, `outlierCount`, `postsPerWeek`):
 * toplanan içerikten ve hesap snapshot'larından, mock ile AYNI hesapla (`applyCompetitorStats` → `lib/metrics`).
 * Okuma yolu parça parça (≤50 rakip/istek); ekran içerik listesini tarayıp kendisi türetmez.
 */
import type { Competitor } from "@/lib/domain/competitor";
import type { AccountSnapshot, ContentItem } from "@/lib/domain/content";
import { applyCompetitorStats } from "@/lib/data/mock/views/competitor-stats";
import type { SupabaseContext } from "@/lib/data/supabase/context";
import { loadLatestMetrics } from "@/lib/data/supabase/content-load";
import { toCompetitor, type CompetitorRow } from "@/lib/data/supabase/mappers/accounts";
import { iso, opt } from "@/lib/data/supabase/mappers/common";
import { CONTENT_COLUMNS, toContentItem, type ContentColumnRow } from "@/lib/data/supabase/mappers/content";
import { fetchAllRows, inChunks } from "@/lib/data/supabase/paging";

export async function withCompetitorStats(ctx: SupabaseContext, wsId: string, rows: readonly CompetitorRow[]): Promise<Competitor[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);

  const [contentRows, snapshotRows] = await Promise.all([
    inChunks(ids, (part) =>
      fetchAllRows((from, to) =>
        ctx.db
          .from("content_items")
          .select(CONTENT_COLUMNS)
          .eq("workspace_id", wsId)
          .in("competitor_id", part)
          .order("id", { ascending: true })
          .range(from, to),
      ),
    ),
    inChunks(ids, (part) =>
      fetchAllRows((from, to) =>
        ctx.db
          .from("account_snapshots")
          .select("id, competitor_id, captured_at, followers")
          .eq("workspace_id", wsId)
          .in("competitor_id", part)
          .not("followers", "is", null)
          .order("captured_at", { ascending: false })
          .order("id", { ascending: true })
          .range(from, to),
      ),
    ),
  ]);
  const latest = await loadLatestMetrics(ctx, wsId, contentRows.map((c) => c.id));

  const byId = new Map(rows.map((r) => [r.id, r]));
  const items: ContentItem[] = contentRows.flatMap((row: ContentColumnRow) => {
    const competitor = row.competitor_id === null ? undefined : byId.get(row.competitor_id);
    if (!competitor) return [];
    const owner = { kind: "competitor" as const, id: competitor.id, handle: competitor.handle, followers: opt(competitor.followers) };
    return [toContentItem({ ...row, transcripts: null, content_analyses: null }, owner, latest.get(row.id))];
  });
  const snapshots: AccountSnapshot[] = snapshotRows.flatMap((s) =>
    s.competitor_id === null ? [] : [{ id: s.id, subjectKind: "competitor" as const, subjectId: s.competitor_id, capturedAt: iso(s.captured_at), followers: opt(s.followers), extra: {} }],
  );

  const counts = new Map<string, number>();
  for (const item of items) counts.set(item.owner.id, (counts.get(item.owner.id) ?? 0) + 1);
  const competitors = rows.map((row) => toCompetitor(row, counts.get(row.id) ?? 0));
  applyCompetitorStats(competitors, items, snapshots);
  return competitors;
}
