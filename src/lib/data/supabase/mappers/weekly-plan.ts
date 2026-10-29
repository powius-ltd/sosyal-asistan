/**
 * Haftalık plan satırları (`weekly_plans`, `weekly_plan_items`) → `WeeklyPlan` / `WeeklyPlanSummary`. Bölümler jsonb'dir:
 * `parsePlanSections` bölüm bölüm doğrular (bozuk bölüm yalnız kendi yerine boş bölüm bırakır). Plana giren (`position` dolu)
 * ve aday (`position` NULL) öğeler ayrılır. Fikir kartları (`Idea`) depo tarafından kanıtlarıyla yüklenir (`ideas.ts`).
 */
import type { Idea } from "@/lib/domain/intel";
import type { WeeklyPlan, WeeklyPlanItem, WeeklyPlanSummary } from "@/lib/domain/weekly-plan";
import type { Tables } from "@/lib/supabase/database.types";
import { parsePlanBrief, parsePlanSections } from "@/lib/data/weekly-plan-schema";
import { iso, isoOpt, opt } from "@/lib/data/supabase/mappers/common";
import { confidenceOf, weeklyPlanStatusOf } from "@/lib/data/supabase/mappers/enums";

export const WEEKLY_PLAN_COLUMNS =
  "id, workspace_id, social_account_id, platform, week_start, status, summary, confidence, sections, brief, approved_at, taxonomy_version, prompt_version, model, run_ids, generated_at, created_at, updated_at" as const;

export type WeeklyPlanRow = Pick<
  Tables<"weekly_plans">,
  | "id"
  | "workspace_id"
  | "social_account_id"
  | "platform"
  | "week_start"
  | "status"
  | "summary"
  | "confidence"
  | "sections"
  | "brief"
  | "approved_at"
  | "taxonomy_version"
  | "prompt_version"
  | "model"
  | "run_ids"
  | "generated_at"
  | "created_at"
  | "updated_at"
>;

export const PLAN_ITEM_COLUMNS = "plan_id, idea_id, position, slot_at, slot_note, brief_slot" as const;
export type PlanItemRow = Pick<Tables<"weekly_plan_items">, "plan_id" | "idea_id" | "position" | "slot_at" | "slot_note" | "brief_slot">;

/** Plana giren önce (sıra artan), sonra adaylar (fikir puanı azalan, eşitlikte kimlik). Fikri bulunamayan öğe atlanır. */
export function toPlanItems(rows: readonly PlanItemRow[], ideas: ReadonlyMap<string, Idea>): { items: WeeklyPlanItem[]; alternatives: WeeklyPlanItem[] } {
  const all = rows.flatMap((row): WeeklyPlanItem[] => {
    const idea = ideas.get(row.idea_id);
    return idea
      ? [{ ideaId: row.idea_id, position: opt(row.position), slotAt: isoOpt(row.slot_at), slotNote: opt(row.slot_note), briefSlot: opt(row.brief_slot), idea }]
      : [];
  });
  const items = all.filter((i) => i.position !== undefined).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const alternatives = all
    .filter((i) => i.position === undefined)
    .sort((a, b) => b.idea.rankScore - a.idea.rankScore || (a.ideaId < b.ideaId ? -1 : 1));
  return { items, alternatives };
}

export function toWeeklyPlan(row: WeeklyPlanRow, itemRows: readonly PlanItemRow[], ideas: ReadonlyMap<string, Idea>): WeeklyPlan {
  const { items, alternatives } = toPlanItems(itemRows, ideas);
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    accountId: opt(row.social_account_id),
    platform: row.platform,
    weekStart: row.week_start,
    status: weeklyPlanStatusOf(row.status),
    summary: opt(row.summary),
    confidence: row.confidence === null ? undefined : confidenceOf(row.confidence),
    sections: parsePlanSections(row.sections),
    brief: parsePlanBrief(row.brief),
    approvedAt: isoOpt(row.approved_at),
    items,
    alternatives,
    taxonomyVersion: row.taxonomy_version,
    promptVersion: row.prompt_version,
    model: opt(row.model),
    runIds: row.run_ids,
    generatedAt: iso(row.generated_at),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

export function toWeeklyPlanSummary(row: WeeklyPlanRow, itemRows: readonly Pick<PlanItemRow, "position">[]): WeeklyPlanSummary {
  return {
    id: row.id,
    weekStart: row.week_start,
    status: weeklyPlanStatusOf(row.status),
    confidence: row.confidence === null ? undefined : confidenceOf(row.confidence),
    summary: opt(row.summary),
    plannedCount: itemRows.filter((i) => i.position !== null).length,
    alternativeCount: itemRows.filter((i) => i.position === null).length,
    generatedAt: iso(row.generated_at),
  };
}
