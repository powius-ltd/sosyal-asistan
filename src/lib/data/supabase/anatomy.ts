/**
 * Kreatif Anatomisi (Supabase): hesap mock ile AYNI fonksiyondur (`lib/anatomy` `buildAnatomy`); burada yalnız girdi kümesi okunur,
 * SABİT sayıda sorgu (video sayısıyla büyümez; N+1 yok): kendi hesaplar + rakipler, `ok` + kanıtı doğrulanmış analizler, pencerede
 * yayınlanan kısa videolar (yalnız analizli olanlar sahip/metrikle doldurulur), konu eleğinin niş dışı bulduğu içerik kimlikleri.
 * Transcript okunmaz: toplu rapor yalnız analiz alanlarından hesaplanır (rakip transcript'i 90 günde silinse de rapor değişmez; tek
 * video sayfası transcript'i `getContent`'ten alır, o da süresi dolanı maskeler). Saat: `ctx.now()`. Bilinmeyen workspace/hesap → `not_found`.
 */
import { buildAnatomy } from "@/lib/anatomy/aggregate";
import type { Competitor } from "@/lib/domain/competitor";
import type { ContentAnalysis } from "@/lib/domain/intel";
import { RepositoryError } from "@/lib/data/repository";
import { insightsDays } from "@/lib/data/views/insights";
import { DAY_MS } from "@/lib/time";
import { fetchCompetitorRows } from "@/lib/data/supabase/competitor-rows";
import { hydrateContent } from "@/lib/data/supabase/content-load";
import type { SupabaseContext } from "@/lib/data/supabase/context";
import { toCompetitor } from "@/lib/data/supabase/mappers/accounts";
import { CONTENT_SELECT, type ContentRow } from "@/lib/data/supabase/mappers/content";
import { ANALYSIS_COLUMNS, toContentAnalysis, type AnalysisRow } from "@/lib/data/supabase/mappers/intel";
import { fetchAllRows } from "@/lib/data/supabase/paging";
import { listOwnAccounts, requireWorkspace } from "@/lib/data/supabase/workspace";
import type { SupabaseMethod } from "@/lib/data/supabase/not-implemented";
import { readOffNicheIds } from "@/lib/data/supabase/off-niche";

/** Yalnız `ok` + kanıtı doğrulanmış analizler (rapora yalnız bunlar girer; süzme `buildAnatomy`'de de uygulanır). */
async function readVerifiedAnalyses(ctx: SupabaseContext, wsId: string): Promise<ContentAnalysis[]> {
  const rows = await fetchAllRows((from, to) =>
    ctx.db
      .from("content_analyses")
      .select(ANALYSIS_COLUMNS)
      .eq("workspace_id", wsId)
      .eq("status", "ok")
      .eq("evidence_verified", true)
      .order("id", { ascending: true })
      .range(from, to)
      .overrideTypes<AnalysisRow[], { merge: false }>(),
  );
  return rows.map(toContentAnalysis);
}

export const getAnatomy: SupabaseMethod<"getAnatomy"> = async (ctx, wsId, query = {}) => {
  await requireWorkspace(ctx, wsId);
  const now = ctx.now();
  const days = insightsDays(query.days);
  const [own, competitorRows] = await Promise.all([listOwnAccounts(ctx, wsId), fetchCompetitorRows(ctx, wsId)]);
  if (query.accountId !== undefined && !own.some((a) => a.id === query.accountId)) {
    throw new RepositoryError("not_found", `Hesap bulunamadı: ${query.accountId}`);
  }
  const competitors: Competitor[] = competitorRows.map((row) => toCompetitor(row, 0));

  const since = new Date(now.getTime() - days * DAY_MS).toISOString();
  const [analyses, offNicheContentIds, rows] = await Promise.all([
    readVerifiedAnalyses(ctx, wsId),
    readOffNicheIds(ctx, wsId),
    fetchAllRows((from, to) =>
      ctx.db
        .from("content_items")
        .select(CONTENT_SELECT)
        .eq("workspace_id", wsId)
        .eq("format", "short_video")
        .gte("published_at", since)
        .lte("published_at", now.toISOString())
        .order("id", { ascending: true })
        .range(from, to)
        .overrideTypes<ContentRow[], { merge: false }>(),
    ),
  ]);
  // Yalnız analizli videolar sahip + son metrikle doldurulur (analizsiz videonun okunması gereksiz).
  const analyzedIds = new Set(analyses.map((a) => a.contentItemId));
  const items = await hydrateContent(ctx, wsId, rows.filter((row) => analyzedIds.has(row.id)));
  return buildAnatomy({ workspaceId: wsId, own, competitors, items, analyses, offNicheContentIds, now }, { ...query, days });
};
