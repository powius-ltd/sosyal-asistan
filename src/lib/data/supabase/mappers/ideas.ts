/**
 * Fikir satırları → `Idea`. Kanıt (`idea_evidence`) özeti okuma anında içerikten türetilir (`summarizeContent`,
 * `content_items` ⨝ `content_analyses`): saklanan kopya yok, yalnız üretildiği andaki lift (`lift_at_creation`) saklıdır.
 * `details` (script, açıklama taslağı, kalıcı kısa rakip alıntıları) alan alan doğrulanır (`idea-details.ts`).
 */
import type { Idea, IdeaEvidence, IdeaPlanLink } from "@/lib/domain/intel";
import type { Tables } from "@/lib/supabase/database.types";
import { iso, opt, primitiveRecord, stringList } from "@/lib/data/supabase/mappers/common";
import { focusDirectionIndex } from "@/lib/domain/weekly-plan";
import { ideaSourceOf, ideaStatusOf } from "@/lib/data/supabase/mappers/enums";
import { toIdeaDetails } from "@/lib/data/supabase/mappers/idea-details";

export const IDEA_COLUMNS =
  "id, workspace_id, status, title, rationale, platform, format, source, hook_type, hooks, script_outline, details, rank_score, rank_inputs, created_at, updated_at" as const;

export type IdeaRow = Pick<
  Tables<"ideas">,
  | "id"
  | "workspace_id"
  | "status"
  | "title"
  | "rationale"
  | "platform"
  | "format"
  | "source"
  | "hook_type"
  | "hooks"
  | "script_outline"
  | "details"
  | "rank_score"
  | "rank_inputs"
  | "created_at"
  | "updated_at"
>;

export const EVIDENCE_COLUMNS = "idea_id, content_item_id, lift_at_creation" as const;
export type EvidenceRow = Pick<Tables<"idea_evidence">, "idea_id" | "content_item_id" | "lift_at_creation">;

/** `rank_inputs.directionRef` (plan üretimi yazar; yoksa ya da biçim dışıysa undefined). */
function directionRefOf(rankInputs: IdeaRow["rank_inputs"]): string | undefined {
  const ref = primitiveRecord(rankInputs).directionRef;
  return typeof ref === "string" && focusDirectionIndex(ref) !== undefined ? ref : undefined;
}

export function toIdea(row: IdeaRow, evidence: IdeaEvidence[], publishJobId: string | undefined, weeklyPlan?: IdeaPlanLink): Idea {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    status: ideaStatusOf(row.status),
    title: row.title,
    rationale: row.rationale,
    platform: row.platform,
    format: row.format,
    source: ideaSourceOf(row.source),
    hooks: stringList(row.hooks),
    hookType: opt(row.hook_type),
    scriptOutline: stringList(row.script_outline),
    details: toIdeaDetails(row.details),
    rankScore: row.rank_score,
    directionRef: directionRefOf(row.rank_inputs),
    evidence,
    publishJobId,
    weeklyPlan,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}
