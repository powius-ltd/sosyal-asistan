/**
 * Sözleşme süiti test verisi (Analist brifingi): test workspace'ine, yazma sözleşmesiyle (`briefingRowSchema`) doğrulanmış tek
 * brifing satırı. Ref'ler seed'in GERÇEK içeriğine bağlanır (kendi bir video) ve bu haftanın planına (`seedWeeklyPlan` bu haftayı kurar).
 */
import { briefingRowSchema } from "@/lib/data/briefing-schema";
import { cellRef, contentRef, dueRef, planRef } from "@/lib/domain/briefing-refs";
import { toDayKey } from "@/lib/format";
import { weekStartOf } from "@/lib/domain/weekly-plan";
import type { TablesInsert } from "@/lib/supabase/database.types";

export function buildBriefingRow(wsId: string, input: { ownContentId: string; now: Date }): TablesInsert<"agent_briefings"> {
  const planWeek = weekStartOf(toDayKey(input.now, "Europe/Istanbul") ?? input.now.toISOString().slice(0, 10));
  if (planWeek === undefined) throw new Error("seed-briefing: plan haftası hesaplanamadı");
  const row = {
    workspace_id: wsId,
    agent: "analyst" as const,
    generated_at: new Date(input.now.getTime() - 3_600_000).toISOString(),
    payload: {
      schemaVersion: 1 as const,
      items: [
        {
          kind: "worked" as const,
          headline: "Seed: en iyi videon baz çizgisinin üstünde",
          body: "Seed metni. Tek video; zayıf sinyal.",
          evidence: [contentRef(input.ownContentId)],
          confidence: "low" as const,
        },
        {
          kind: "opportunity" as const,
          headline: "Seed: denemediğin hücre",
          body: "Seed metni. Az örnek.",
          evidence: [cellRef("hic-farkinda-degil", "aci-korku")],
          action: { type: "open_matrix" as const, label: "Yaklaşımı aç", target: cellRef("hic-farkinda-degil", "aci-korku"), spendsMoney: false },
          confidence: "low" as const,
        },
        {
          kind: "next_step" as const,
          headline: "Seed: planı gözden geçir",
          body: "Seed metni.",
          evidence: [planRef(planWeek)],
          action: { type: "open_plan" as const, label: "Planı aç", target: planRef(planWeek), spendsMoney: false },
          confidence: "medium" as const,
        },
        {
          kind: "pending" as const,
          headline: "Seed: ölçüm zamanı geldi",
          body: "Seed metni. Ölçüm koşusu Apify kullanır.",
          evidence: [dueRef(input.ownContentId, 7)],
          action: { type: "run_cmd" as const, label: "Ölçüm koşusu", commandId: "measure" as const, spendsMoney: true },
          confidence: "medium" as const,
        },
      ],
    },
    basis: { analyzedCount: 3, labeledCount: 2, planWeek },
    prompt_version: "seed",
    persona_version: "seed",
    model: "seed",
  };
  briefingRowSchema.parse(row);
  return row;
}
