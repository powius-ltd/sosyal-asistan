/**
 * Kreatif etiket (`content_creative_labels`) okuma/yazma (service role; her satır açıkça `workspace_id` ile). İçerik başına tek GÜNCEL
 * satır: yeniden etiketleme üzerine yazar (`content_item_id` upsert anahtarı). Yazılacak satır DB'ye gitmeden önce
 * `creativeLabelRowSchema` ile doğrulanır (yazan ve okuyan aynı şema). `evidence_verified` her zaman açıkça yazılır.
 */
import "server-only";

import { creativeLabelRowSchema } from "@/lib/data/creative-label-schema";
import { fetchAllRows } from "@/lib/data/supabase/paging";
import type { AngleLabel } from "@/lib/llm/label-angles";
import type { AdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";

type LabelRow = Database["public"]["Tables"]["content_creative_labels"]["Insert"];

export interface LabelRowContext {
  workspaceId: string;
  promptVersion: string;
  model?: string;
  runId?: string;
  now: Date;
}

/** `content_items.id` → mevcut etiketin istem sürümü (etiketi olmayanlar haritada yok). */
export async function loadLabelVersions(client: AdminClient, wsId: string): Promise<Map<string, string>> {
  const rows = await fetchAllRows((from, to) =>
    client
      .from("content_creative_labels")
      .select("content_item_id, prompt_version")
      .eq("workspace_id", wsId)
      .order("content_item_id", { ascending: true })
      .range(from, to)
      .overrideTypes<{ content_item_id: string; prompt_version: string }[], { merge: false }>(),
  );
  return new Map(rows.map((row) => [row.content_item_id, row.prompt_version]));
}

/** Etiket sonucunu doğrulanmış DB satırına çevirir (saf). Şemaya uymayan satır hata fırlatır: bozuk etiket yazılmaz. */
export function toLabelRow(label: AngleLabel, ctx: LabelRowContext): LabelRow {
  return creativeLabelRowSchema.parse({
    content_item_id: label.id,
    workspace_id: ctx.workspaceId,
    angle: label.angle,
    funnel_stage: label.funnelStage,
    angle_evidence: label.angleEvidence,
    funnel_evidence: label.funnelEvidence,
    evidence_verified: label.evidenceVerified,
    prompt_version: ctx.promptVersion,
    model: ctx.model ?? null,
    run_id: ctx.runId ?? null,
    labeled_at: ctx.now.toISOString(),
  });
}

/** Etiketleri yazar (içerik başına güncel satır). Boş liste → istek yok. */
export async function saveLabels(client: AdminClient, labels: readonly AngleLabel[], ctx: LabelRowContext): Promise<void> {
  if (labels.length === 0) return;
  const rows = labels.map((label) => toLabelRow(label, ctx));
  const { error } = await client.from("content_creative_labels").upsert(rows, { onConflict: "content_item_id" });
  if (error) throw new Error(`Kreatif etiket yazılamadı: ${error.message}`);
}
