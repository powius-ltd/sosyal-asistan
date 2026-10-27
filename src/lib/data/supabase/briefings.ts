/**
 * Ajan brifingi okuması (Supabase). Yazan sunucu görevi `brief:now` (service role, `briefing-schema.ts` ile doğrulanmış satır);
 * burada yalnız en yenisi okunur. Tablo boşsa `null` (hata değil). Her sorgu açıkça `workspace_id` süzgeçlidir.
 */
import type { SupabaseContext } from "@/lib/data/supabase/context";
import { isUuid, unwrap } from "@/lib/data/supabase/errors";
import { BRIEFING_COLUMNS, toBriefing } from "@/lib/data/supabase/mappers/briefing";
import { ANALYST_AGENT, type Briefing } from "@/lib/domain/briefing";

/** En yeni kaç satıra bakılır: biçimi bozuk satır atlanır, bir önceki geçerli brifing kalır. */
const SCAN_LIMIT = 5;

export async function getLatestBriefing(ctx: SupabaseContext, wsId: string): Promise<Briefing | null> {
  if (!isUuid(wsId)) return null;
  const rows = unwrap(
    await ctx.db
      .from("agent_briefings")
      .select(BRIEFING_COLUMNS)
      .eq("workspace_id", wsId)
      .eq("agent", ANALYST_AGENT)
      .order("generated_at", { ascending: false })
      .limit(SCAN_LIMIT),
  );
  for (const row of rows) {
    const briefing = toBriefing(row);
    if (briefing !== undefined) return briefing;
  }
  return null;
}
