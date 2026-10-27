/**
 * Rakip satırlarının TÜMÜNÜ okur (1000 satırlık PostgREST sınırını aşan workspace'lerde sessizce kırpılmasın diye sayfa
 * sayfa). Genel bakış, haftalık özet, ölçülemeyenler, keşif, arama ve benzer-boy süzgeci aynı okumayı kullanır.
 */
import type { CompetitorSource, CompetitorStatus } from "@/lib/domain/competitor";
import type { Platform } from "@/lib/platforms/types";
import type { SupabaseContext } from "@/lib/data/supabase/context";
import { COMPETITOR_COLUMNS, type CompetitorRow } from "@/lib/data/supabase/mappers/accounts";
import { fetchAllRows } from "@/lib/data/supabase/paging";

export interface CompetitorRowFilter {
  platform?: Platform;
  statuses?: readonly CompetitorStatus[];
  source?: CompetitorSource;
  /** Bu kaynak HARİÇ (keşif adayları `manual` olmayanlardır). */
  excludeSource?: CompetitorSource;
  /** Yeniden eskiye (varsayılan eskiden yeniye); eşitlikte kimlik artan. */
  newestFirst?: boolean;
}

export async function fetchCompetitorRows(ctx: SupabaseContext, wsId: string, filter: CompetitorRowFilter = {}): Promise<CompetitorRow[]> {
  return fetchAllRows((from, to) => {
    let query = ctx.db.from("competitors").select(COMPETITOR_COLUMNS).eq("workspace_id", wsId);
    if (filter.platform) query = query.eq("platform", filter.platform);
    if (filter.statuses) query = query.in("status", [...filter.statuses]);
    if (filter.source) query = query.eq("source", filter.source);
    if (filter.excludeSource) query = query.neq("source", filter.excludeSource);
    return query
      .order("created_at", { ascending: !filter.newestFirst })
      .order("id", { ascending: true })
      .range(from, to);
  });
}
