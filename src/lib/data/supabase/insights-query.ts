/**
 * Karşılaştırma içgörüleri (`getInsights`): hesap mock ile AYNI fonksiyondur (`views/insights` → `buildInsights`); burada
 * yalnız girdi kümesi okunur: kendi hesaplar, izlenen (`tracked`) rakipler, pencerede yayınlanan kısa videoları (skor önbelleği
 * + son ölçüm ile), konu eleğinin niş dışı bulduğu içerik kimlikleri (`content_topic_screens`, `in_niche = false`) ve hook türü
 * grupları için analizler (`content_analyses`: kimlik, hook türü, durum, kanıt doğrulaması — `buildInsights` yalnız `ok` +
 * doğrulanmış olanı sayar). Workspace başına sabit sayıda sorgu (içerik sayısıyla büyümez; N+1 yok). Saat: `ctx.now()`.
 * Bilinmeyen workspace/hesap → `not_found`.
 */
import type { Competitor } from "@/lib/domain/competitor";
import type { Insights } from "@/lib/domain/insights";
import type { InsightsQuery } from "@/lib/data/queries";
import { RepositoryError } from "@/lib/data/repository";
import { buildInsights, insightsDays } from "@/lib/data/views/insights";
import type { AnalysisRef } from "@/lib/insights/types";
import { DAY_MS } from "@/lib/time";
import { fetchCompetitorRows } from "@/lib/data/supabase/competitor-rows";
import { hydrateContent } from "@/lib/data/supabase/content-load";
import type { SupabaseContext } from "@/lib/data/supabase/context";
import { toCompetitor } from "@/lib/data/supabase/mappers/accounts";
import { CONTENT_SELECT, type ContentRow } from "@/lib/data/supabase/mappers/content";
import { analysisStatusOf } from "@/lib/data/supabase/mappers/enums";
import { fetchAllRows } from "@/lib/data/supabase/paging";
import { listOwnAccounts, requireWorkspace } from "@/lib/data/supabase/workspace";
import { readOffNicheIds } from "@/lib/data/supabase/off-niche";

/** Hook türü grupları için analiz referansları (kimlik, hook türü, durum, kanıt doğrulaması); süzme `buildInsights`'ta (tek kural). */
async function readAnalysisRefs(ctx: SupabaseContext, wsId: string): Promise<AnalysisRef[]> {
  const rows = await fetchAllRows((from, to) =>
    ctx.db
      .from("content_analyses")
      .select("content_item_id, hook_type, status, evidence_verified")
      .eq("workspace_id", wsId)
      .order("content_item_id", { ascending: true })
      .range(from, to)
      .overrideTypes<{ content_item_id: string; hook_type: string | null; status: string; evidence_verified: boolean }[], { merge: false }>(),
  );
  return rows.map((row) => ({
    contentItemId: row.content_item_id,
    status: analysisStatusOf(row.status),
    evidenceVerified: row.evidence_verified,
    hookType: row.hook_type ?? undefined,
  }));
}

export async function getInsights(ctx: SupabaseContext, wsId: string, query: InsightsQuery = {}): Promise<Insights> {
  const workspace = await requireWorkspace(ctx, wsId);
  const now = ctx.now();
  const days = insightsDays(query.days);
  const [own, competitorRows] = await Promise.all([listOwnAccounts(ctx, wsId), fetchCompetitorRows(ctx, wsId)]);
  if (query.accountId !== undefined && !own.some((a) => a.id === query.accountId)) {
    throw new RepositoryError("not_found", `Hesap bulunamadı: ${query.accountId}`);
  }
  const competitors: Competitor[] = competitorRows.map((row) => toCompetitor(row, 0));

  // Yalnız pencerede yayınlanan kısa videolar; sahip süzgeci (kapsamdaki kendi hesap + izlenen rakip) TS tarafında uygulanır.
  const since = new Date(now.getTime() - days * DAY_MS).toISOString();
  const [rows, offNicheContentIds, analyses] = await Promise.all([
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
    readOffNicheIds(ctx, wsId),
    readAnalysisRefs(ctx, wsId),
  ]);
  const items = await hydrateContent(ctx, wsId, rows);
  return buildInsights({ workspace, own, competitors, items, now, analyses, offNicheContentIds }, { ...query, days });
}
