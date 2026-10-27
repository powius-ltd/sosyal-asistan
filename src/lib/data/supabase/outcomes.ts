/**
 * "Geçen hafta" sonucu + "ölçüm zamanı geldi" listesi (Supabase). Plan + bağlar + `metric_snapshots` okunur; hesap
 * `lib/outcomes/*` saf fonksiyonlarıdır (`buildWeekReview` / `buildMeasurementDue`) — mock ile AYNI girdi şekli, AYNI hesap.
 * Okuma anında hesaplanır (kayıtlı `sections.review` yer tutucudur); yazma yok.
 */
import type { SupabaseContext } from "@/lib/data/supabase/context";
import { isUuid } from "@/lib/data/supabase/errors";
import { getWeeklyPlan } from "@/lib/data/supabase/weekly-plans";
import { parseWeekStart } from "@/lib/data/weekly-plan-input";
import type { MeasurementDue, WeekReview } from "@/lib/domain/outcomes";
import { loadMeasurementDue, loadOutcomeContents, loadSuggestionCounts } from "@/lib/outcomes/load";
import { buildWeekReview } from "@/lib/outcomes/review";

export async function getWeekReview(ctx: SupabaseContext, wsId: string, weekStart: string, now: Date): Promise<WeekReview | null> {
  parseWeekStart(weekStart); // biçimsiz gün her koşulda invalid_input
  if (!isUuid(wsId)) return null;
  const plan = await getWeeklyPlan(ctx, wsId, weekStart);
  if (!plan) return null;

  const confirmedContentIds = plan.items.flatMap((item) => {
    const link = item.idea.reelLink;
    return link?.status === "confirmed" && link.contentItemId !== undefined ? [link.contentItemId] : [];
  });
  const [contents, suggestionCounts] = await Promise.all([
    loadOutcomeContents(ctx.db, wsId, confirmedContentIds),
    loadSuggestionCounts(ctx.db, wsId, plan.items.map((item) => item.ideaId)),
  ]);
  return buildWeekReview({ plan, contents, suggestionCounts, now });
}

export async function listMeasurementDue(ctx: SupabaseContext, wsId: string, now: Date): Promise<MeasurementDue[]> {
  return isUuid(wsId) ? loadMeasurementDue(ctx.db, wsId, now) : [];
}
