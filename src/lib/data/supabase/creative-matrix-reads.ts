/**
 * Kreatif Matris'in girdi okumaları (Supabase): her biri tek (sayfalı) sorgu, hepsi `workspace_id` süzgeçli. Hesap `lib/matrix`'tedir;
 * burada yalnız satır → girdi eşlemesi var. Bozuk satır (taksonomide olmayan açı/katman: DB check'leri bunu engeller, yine de) tüm
 * matrisi düşürmez, atlanır.
 */
import type { ContentCreativeLabel } from "@/lib/domain/creative-matrix";
import { CREATIVE_ANGLE_SCHEMA, FUNNEL_STAGE_SCHEMA } from "@/lib/data/creative-label-schema";
import type { SupabaseContext } from "@/lib/data/supabase/context";
import { iso, opt } from "@/lib/data/supabase/mappers/common";
import { analysisStatusOf } from "@/lib/data/supabase/mappers/enums";
import { fetchAllRows } from "@/lib/data/supabase/paging";
import type { AnalysisRef } from "@/lib/insights/types";

interface LabelRow {
  content_item_id: string;
  angle: string;
  funnel_stage: string;
  angle_evidence: string;
  funnel_evidence: string;
  evidence_verified: boolean;
  prompt_version: string;
  model: string | null;
  run_id: string | null;
  labeled_at: string;
}

const LABEL_COLUMNS = "content_item_id, angle, funnel_stage, angle_evidence, funnel_evidence, evidence_verified, prompt_version, model, run_id, labeled_at";

function toLabel(row: LabelRow): ContentCreativeLabel | undefined {
  const angle = CREATIVE_ANGLE_SCHEMA.safeParse(row.angle);
  const stage = FUNNEL_STAGE_SCHEMA.safeParse(row.funnel_stage);
  if (!angle.success || !stage.success) return undefined;
  return {
    contentItemId: row.content_item_id,
    angle: angle.data,
    funnelStage: stage.data,
    angleEvidence: row.angle_evidence,
    funnelEvidence: row.funnel_evidence,
    evidenceVerified: row.evidence_verified,
    promptVersion: row.prompt_version,
    model: opt(row.model),
    runId: opt(row.run_id),
    labeledAt: iso(row.labeled_at),
  };
}

/** Yalnız kanıtı doğrulanmış etiketler (kısmi indeks `content_creative_labels_verified_idx`): doğrulanmamış etiket hücre doldurmaz. */
export async function readVerifiedLabels(ctx: SupabaseContext, wsId: string): Promise<ContentCreativeLabel[]> {
  const rows = await fetchAllRows((from, to) =>
    ctx.db
      .from("content_creative_labels")
      .select(LABEL_COLUMNS)
      .eq("workspace_id", wsId)
      .eq("evidence_verified", true)
      .order("content_item_id", { ascending: true })
      .range(from, to)
      .overrideTypes<LabelRow[], { merge: false }>(),
  );
  return rows.flatMap((row) => toLabel(row) ?? []);
}

/** `ok` + kanıtı doğrulanmış analizlerin referansı (kimlik, durum, doğrulama, hook türü); içerik başına tek analiz (unique). */
export async function readVerifiedAnalysisRefs(ctx: SupabaseContext, wsId: string): Promise<AnalysisRef[]> {
  const rows = await fetchAllRows((from, to) =>
    ctx.db
      .from("content_analyses")
      .select("content_item_id, hook_type, status, evidence_verified")
      .eq("workspace_id", wsId)
      .eq("status", "ok")
      .eq("evidence_verified", true)
      .order("content_item_id", { ascending: true })
      .range(from, to)
      .overrideTypes<{ content_item_id: string; hook_type: string | null; status: string; evidence_verified: boolean }[], { merge: false }>(),
  );
  return rows.map((row) => ({
    contentItemId: row.content_item_id,
    status: analysisStatusOf(row.status),
    evidenceVerified: row.evidence_verified,
    hookType: opt(row.hook_type),
  }));
}

