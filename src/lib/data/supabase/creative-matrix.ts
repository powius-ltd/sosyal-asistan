/**
 * Kreatif Matris (Supabase): hesap mock ile AYNI fonksiyondur (`lib/matrix` `buildCreativeMatrix`); burada yalnız girdi kümesi okunur,
 * SABİT sayıda sorgu (video sayısıyla büyümez; N+1 yok): kendi hesaplar + rakipler, `ok` + doğrulanmış analiz referansları (hook türü),
 * doğrulanmış etiketler (`content_creative_labels`), niş dışı içerik kimlikleri ve pencerede yayınlanan kısa videolar (yalnız analizli
 * olanlar sahip/metrikle doldurulur). Transcript okunmaz. Saat: `ctx.now()`. Bilinmeyen workspace → `not_found`.
 */
import type { Competitor } from "@/lib/domain/competitor";
import { buildAdMatrixSource } from "@/lib/matrix/ad-source";
import { buildCreativeMatrix } from "@/lib/matrix/build";
import { loadAdDataset } from "@/lib/data/supabase/ads";
import { insightsDays } from "@/lib/data/views/insights";
import { DAY_MS } from "@/lib/time";
import { fetchCompetitorRows } from "@/lib/data/supabase/competitor-rows";
import { hydrateContent } from "@/lib/data/supabase/content-load";
import { readVerifiedAnalysisRefs, readVerifiedLabels } from "@/lib/data/supabase/creative-matrix-reads";
import { readOffNicheIds } from "@/lib/data/supabase/off-niche";
import { toCompetitor } from "@/lib/data/supabase/mappers/accounts";
import { CONTENT_SELECT, type ContentRow } from "@/lib/data/supabase/mappers/content";
import { fetchAllRows } from "@/lib/data/supabase/paging";
import { listOwnAccounts, requireWorkspace } from "@/lib/data/supabase/workspace";
import type { SupabaseMethod } from "@/lib/data/supabase/not-implemented";

export const getCreativeMatrix: SupabaseMethod<"getCreativeMatrix"> = async (ctx, wsId, query = {}) => {
  await requireWorkspace(ctx, wsId);
  const now = ctx.now();
  const days = insightsDays(query.days);
  const [own, competitorRows] = await Promise.all([listOwnAccounts(ctx, wsId), fetchCompetitorRows(ctx, wsId)]);
  const competitors: Competitor[] = competitorRows.map((row) => toCompetitor(row, 0));

  const since = new Date(now.getTime() - days * DAY_MS).toISOString();
  const [analyses, labels, offNicheContentIds, adData, rows] = await Promise.all([
    readVerifiedAnalysisRefs(ctx, wsId),
    readVerifiedLabels(ctx, wsId),
    readOffNicheIds(ctx, wsId),
    loadAdDataset(ctx, wsId, now),
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
  return buildCreativeMatrix({ workspaceId: wsId, own, competitors, items, analyses, labels, offNicheContentIds, ads: buildAdMatrixSource(adData, now), now }, { ...query, days });
};
