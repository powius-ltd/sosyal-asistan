/**
 * Haftalık plan + ses profili okumaları (Faz 2). Plan yalnız sunucu tarafından yazılır (`save_weekly_plan` RPC, service role);
 * burada yalnız okunur. Tablolar boşsa null/[] döner (hata değil). Her sorgu açıkça `workspace_id` süzgeçlidir.
 *  - `getWeeklyPlan`: plan satırı + öğeler + fikir kartları (kanıt özetleri ve plan bağı `ideas.ts` ile, sabit sayıda istek).
 *  - `listWeeklyPlans`: fikirleri yüklemeden özet satırları (yeniden eskiye).
 *  - `getVoiceProfile`: hesap başına tek güncel profil.
 */
import { RepositoryError } from "@/lib/data/repository";
import type { VoiceProfile } from "@/lib/domain/voice-profile";
import type { WeeklyPlan, WeeklyPlanSummary } from "@/lib/domain/weekly-plan";
import type { WeeklyPlanListQuery } from "@/lib/data/queries";
import { parseWeekStart } from "@/lib/data/weekly-plan-input";
import type { SupabaseContext } from "@/lib/data/supabase/context";
import { isUuid, unwrap } from "@/lib/data/supabase/errors";
import { loadIdeasByIds } from "@/lib/data/supabase/ideas";
import { VOICE_PROFILE_COLUMNS, toVoiceProfile } from "@/lib/data/supabase/mappers/voice-profile";
import {
  PLAN_ITEM_COLUMNS,
  WEEKLY_PLAN_COLUMNS,
  toWeeklyPlan,
  toWeeklyPlanSummary,
  type PlanItemRow,
} from "@/lib/data/supabase/mappers/weekly-plan";
import { clampLimit, inChunks } from "@/lib/data/supabase/paging";

export async function getWeeklyPlan(ctx: SupabaseContext, wsId: string, weekStartInput: string): Promise<WeeklyPlan | null> {
  const weekStart = parseWeekStart(weekStartInput);
  if (!isUuid(wsId)) return null;
  const plan = unwrap(
    await ctx.db.from("weekly_plans").select(WEEKLY_PLAN_COLUMNS).eq("workspace_id", wsId).eq("week_start", weekStart).maybeSingle(),
  );
  if (!plan) return null;
  const itemRows = unwrap(await ctx.db.from("weekly_plan_items").select(PLAN_ITEM_COLUMNS).eq("workspace_id", wsId).eq("plan_id", plan.id));
  const ideas = await loadIdeasByIds(ctx, wsId, itemRows.map((row) => row.idea_id));
  return toWeeklyPlan(plan, itemRows, new Map(ideas.map((idea) => [idea.id, idea])));
}

/** Planı onaylar (SPN-35): kurallar `approve_weekly_plan` RPC'sinde (tek işlem); önkontrol yalnız anlaşılır hata içindir. */
export async function approveWeeklyPlan(ctx: SupabaseContext, wsId: string, weekStartInput: string, now: Date): Promise<WeeklyPlan> {
  const weekStart = parseWeekStart(weekStartInput);
  if (!isUuid(wsId)) throw new RepositoryError("not_found", "Çalışma alanı bulunamadı.");
  const plan = unwrap(await ctx.db.from("weekly_plans").select("id, status").eq("workspace_id", wsId).eq("week_start", weekStart).maybeSingle());
  if (!plan) throw new RepositoryError("not_found", `Bu hafta için plan yok: ${weekStart}`);
  if (plan.status !== "ready") throw new RepositoryError("invalid_state", "Plan hazır değil; onaylanamaz.");
  unwrap(await ctx.db.rpc("approve_weekly_plan", { p_ws: wsId, p_week: weekStart, p_by: ctx.approverUserId, p_now: now.toISOString() }));
  const approved = await getWeeklyPlan(ctx, wsId, weekStart);
  if (!approved) throw new RepositoryError("not_found", `Bu hafta için plan yok: ${weekStart}`);
  return approved;
}

export async function listWeeklyPlans(ctx: SupabaseContext, wsId: string, query: WeeklyPlanListQuery = {}): Promise<WeeklyPlanSummary[]> {
  if (!isUuid(wsId)) return [];
  const plans = unwrap(
    await ctx.db
      .from("weekly_plans")
      .select(WEEKLY_PLAN_COLUMNS)
      .eq("workspace_id", wsId)
      .order("week_start", { ascending: false })
      .limit(clampLimit(query.limit)),
  );
  const items: PlanItemRow[] = await inChunks(plans.map((p) => p.id), async (part) =>
    unwrap(await ctx.db.from("weekly_plan_items").select(PLAN_ITEM_COLUMNS).eq("workspace_id", wsId).in("plan_id", part)),
  );
  return plans.map((plan) => toWeeklyPlanSummary(plan, items.filter((item) => item.plan_id === plan.id)));
}

export async function getVoiceProfile(ctx: SupabaseContext, wsId: string, accountId: string): Promise<VoiceProfile | null> {
  if (!isUuid(wsId) || !isUuid(accountId)) return null;
  const row = unwrap(
    await ctx.db.from("voice_profiles").select(VOICE_PROFILE_COLUMNS).eq("workspace_id", wsId).eq("social_account_id", accountId).maybeSingle(),
  );
  return row ? toVoiceProfile(row) : null;
}
