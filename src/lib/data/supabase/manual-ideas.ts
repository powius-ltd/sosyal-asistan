/**
 * Supabase deposu: hesap sahibinin elle (sohbetten) eklediği fikir (`source = 'manual'`; migration gerekmez: `ideas.source` zaten kabul
 * eder). Kurallar mock ile aynıdır (`mock/repos/manual-ideas.ts`, `manual-idea-input.ts`). Plan yeniden üretimi yalnız
 * `source = 'weekly_plan'` + `status = 'new'` fikri siler (0025): elle fikir silinmez.
 */
import { MANUAL_IDEA_DAILY_MAX, parseManualIdea, type ManualIdeaInput } from "@/lib/data/manual-idea-input";
import { RepositoryError } from "@/lib/data/repository";
import type { SupabaseContext } from "@/lib/data/supabase/context";
import { unwrap } from "@/lib/data/supabase/errors";
import { loadIdeasByIds } from "@/lib/data/supabase/ideas";
import { IDEA_COLUMNS } from "@/lib/data/supabase/mappers/ideas";
import { listOwnAccounts, requireWorkspace } from "@/lib/data/supabase/workspace";
import type { Idea } from "@/lib/domain/intel";
import { DAY_MS } from "@/lib/time";

export async function createManualIdea(ctx: SupabaseContext, wsId: string, input: ManualIdeaInput, now: Date): Promise<Idea> {
  await requireWorkspace(ctx, wsId);
  const value = parseManualIdea(input);
  const account = (await listOwnAccounts(ctx, wsId))[0];
  if (account === undefined) throw new RepositoryError("invalid_state", "Fikir eklemek için önce bir hesap bağlanmalı.");
  const since = new Date(now.getTime() - DAY_MS).toISOString();
  const recent = await ctx.db.from("ideas").select("id", { count: "exact", head: true }).eq("workspace_id", wsId).eq("source", "manual").gte("created_at", since);
  if (recent.error) throw new RepositoryError("invalid_state", "Fikir sınırı okunamadı.");
  if ((recent.count ?? 0) >= MANUAL_IDEA_DAILY_MAX) throw new RepositoryError("invalid_state", "Bugün çok fikir ekledin; yarın devam edebilirsin.");
  const row = unwrap(
    await ctx.db
      .from("ideas")
      .insert({
        workspace_id: wsId,
        status: "new",
        title: value.title,
        rationale: value.note,
        platform: account.platform,
        format: value.format,
        source: "manual",
        hooks: [],
        script_outline: [],
        rank_score: 0,
        rank_inputs: {},
        details: {},
      })
      .select(IDEA_COLUMNS)
      .single(),
  );
  const [idea] = await loadIdeasByIds(ctx, wsId, [row.id]);
  return idea;
}
