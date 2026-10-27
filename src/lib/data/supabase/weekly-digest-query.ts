/**
 * Haftalık özet (`getWeeklyDigest`): `now`dan geriye 7 gün. Toplamlar ve sebep metinleri mock ile AYNI fonksiyondan
 * (`buildWeeklyDigest`); izlenme/takipçi farkı Genel bakışla aynı yardımcıdan (`views/gains`) gelir. "Yeni tutanlar"
 * `listOutliers` ile AYNI süzgeçten okunur (izlenen rakip, kademe ≥ 3, lift'e göre): ekranlar arasında çelişmez.
 * Burada yalnız dönemle ilgili girdi okunur (kendi içerik + snapshot'lar, dönemde yayınlanan rakip içerikleri, dönemde
 * dokunulan fikirler).
 */
import { OUTLIER_MIN_TIER, type ContentItem } from "@/lib/domain/content";
import type { WeeklyDigest } from "@/lib/domain/notification";
import { buildWeeklyDigest, DIGEST_DAYS } from "@/lib/data/views/weekly-digest";
import { DAY_MS } from "@/lib/time";
import { applySharedContentFilters } from "@/lib/data/supabase/content-filters";
import { hydrateContent } from "@/lib/data/supabase/content-load";
import type { SupabaseContext } from "@/lib/data/supabase/context";
import { unwrap } from "@/lib/data/supabase/errors";
import { fetchCompetitorRows } from "@/lib/data/supabase/competitor-rows";
import { toCompetitor } from "@/lib/data/supabase/mappers/accounts";
import { CONTENT_SELECT, type ContentRow } from "@/lib/data/supabase/mappers/content";
import { IDEA_COLUMNS, toIdea } from "@/lib/data/supabase/mappers/ideas";
import { ANALYSIS_COLUMNS, toContentAnalysis } from "@/lib/data/supabase/mappers/intel";
import { loadOutlierItems, loadOwnScope } from "@/lib/data/supabase/own-scope";
import { fetchAllRows, inChunks } from "@/lib/data/supabase/paging";
import { listOwnAccounts, requireWorkspace } from "@/lib/data/supabase/workspace";
import { filterValue } from "@/lib/data/supabase/cursor";

/** Dönemde yayınlanan izlenen-rakip içerikleri (en aktif rakip sayımı için; metrik gerekmez). */
async function loadPeriodCompetitorItems(ctx: SupabaseContext, wsId: string, since: string, until: string): Promise<ContentItem[]> {
  const rows = await fetchAllRows((from, to) =>
    applySharedContentFilters(ctx.db.from("content_items").select(`${CONTENT_SELECT}, competitors!inner(status)`).eq("workspace_id", wsId), { since })
      .eq("competitors.status", "tracked")
      .lte("published_at", until)
      .order("id", { ascending: true })
      .range(from, to)
      .overrideTypes<ContentRow[], { merge: false }>(),
  );
  return hydrateContent(ctx, wsId, rows, { metrics: false });
}

export async function getWeeklyDigest(ctx: SupabaseContext, wsId: string, now: Date): Promise<WeeklyDigest> {
  await requireWorkspace(ctx, wsId);
  const { db } = ctx;
  const startIso = new Date(now.getTime() - DIGEST_DAYS * DAY_MS).toISOString();
  const endIso = now.toISOString();

  const [own, competitorRows, ideaRows] = await Promise.all([
    listOwnAccounts(ctx, wsId),
    fetchCompetitorRows(ctx, wsId),
    // Dönemde oluşturulan ya da güncellenen fikirler (sayaçlar `createdAt`/`updatedAt` ve durumla; kanıt gerekmez).
    fetchAllRows((from, to) =>
      db
        .from("ideas")
        .select(IDEA_COLUMNS)
        .eq("workspace_id", wsId)
        .or(`created_at.gt.${filterValue(startIso)},updated_at.gt.${filterValue(startIso)}`)
        .order("id", { ascending: true })
        .range(from, to),
    ),
  ]);
  const competitors = competitorRows.map((row) => toCompetitor(row, 0));

  const [scope, outliers, competitorItems] = await Promise.all([
    loadOwnScope(ctx, wsId, own.map((a) => a.id)),
    loadOutlierItems(ctx, wsId, { since: startIso, until: endIso }),
    loadPeriodCompetitorItems(ctx, wsId, startIso, endIso),
  ]);

  // Hook türü özeti için yalnız görüntülenebilecek içeriklerin analizi (dönemde yayınlanan kendi içerik + tutanlar).
  const startMs = now.getTime() - DIGEST_DAYS * DAY_MS;
  const shown = [...scope.items.filter((c) => c.publishedAt !== undefined && Date.parse(c.publishedAt) > startMs), ...outliers].map((c) => c.id);
  const analysisRows = await inChunks([...new Set(shown)], async (part) =>
    unwrap(await db.from("content_analyses").select(ANALYSIS_COLUMNS).eq("workspace_id", wsId).in("content_item_id", part)),
  );

  return buildWeeklyDigest(
    {
      own,
      competitors,
      items: [...scope.items, ...competitorItems],
      outliers: outliers.filter((c) => (c.score.liftTier ?? -1) >= OUTLIER_MIN_TIER),
      snapshotsByItem: scope.snapshotsByItem,
      accountSnapshots: scope.accountSnapshots,
      analyses: analysisRows.map(toContentAnalysis),
      ideas: ideaRows.map((row) => toIdea(row, [], undefined)),
    },
    now,
  );
}
