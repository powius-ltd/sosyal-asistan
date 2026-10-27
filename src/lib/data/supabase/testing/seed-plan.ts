/**
 * Sözleşme süiti test verisi (haftalık plan + ses profili): plan GERÇEK yazma yolundan (`save_weekly_plan` RPC) kurulur,
 * böylece RPC + okuma eşlemesi birlikte sınanır. Şimdiki hafta için 3 fikir: ikisi plana girer (sıra 1–2), biri aday kalır;
 * her fikir ≥ 2 farklı rakip içeriğine kanıt gösterir. Ses profili hesap başına tek satırdır (≥ 5 doğrulanmış özellik).
 */
import { emptyPlanSections, type WeeklyPlanSections } from "@/lib/domain/weekly-plan";
import { weekStartOf } from "@/lib/domain/weekly-plan";
import { toDayKey } from "@/lib/format";
import { planBriefToStorage, WEEKLY_PLAN_SECTIONS_SCHEMA } from "@/lib/data/weekly-plan-schema";
import type { CreativeBrief } from "@/lib/llm/creative-brief-schema";
import type { AdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import { must } from "@/lib/data/supabase/testing/seed-ops";

export interface PlanSeedInput {
  accountId: string;
  /** Rakip içerik kimlikleri (≥ 3): fikir kanıtı olarak kullanılır. */
  rivalContentIds: string[];
  /** Sahibin kendi içerik kimlikleri: ses profili örnekleri. */
  ownContentIds: string[];
  timeZone: string;
  now: Date;
}

/** Tohum planın Kreatif direktör brifi: iki slot (S1 uyarla, S2 dene); plana giren iki fikir bu slotları doldurur. */
export const SEED_PLAN_BRIEF: CreativeBrief = {
  theme: "Sözleşme testi haftası: kanıtlı yönü uyarla, bir şeyi dene.",
  pillars: [{ pillar: "Öğreten", slots: 2 }],
  ratio: { adapt: 0.5, test: 0.5 },
  testVariable: { kind: "duration", value: "daha uzun anlatım", why: "Uzun format rakiplerde tutuyor." },
  continuity: { mode: "first_week", note: "Önceki hafta yok." },
  slots: [
    { slotId: "S1", decision: "adapt", pillar: "Öğreten", why: "Kanıtlı yön.", evidenceRef: "F1", evidenceLabel: "90 sn ve üstü" },
    { slotId: "S2", decision: "test", pillar: "Öğreten", testValue: "daha uzun anlatım", why: "Haftanın denemesi.", evidenceRef: "F1", evidenceLabel: "90 sn ve üstü" },
  ],
  evidenceThin: true,
};

export async function seedWeeklyPlan(db: AdminClient, wsId: string, input: PlanSeedInput): Promise<void> {
  const [a, b, c] = input.rivalContentIds;
  if (!a || !b || !c) throw new Error("seedWeeklyPlan: en az 3 rakip içeriği gerekir.");
  const week = weekStartOf(toDayKey(input.now, input.timeZone) ?? input.now.toISOString().slice(0, 10));
  if (!week) throw new Error("seedWeeklyPlan: hafta başı hesaplanamadı.");

  const slotAt = new Date(input.now.getTime() + 24 * 3_600_000).toISOString();
  const sections: WeeklyPlanSections = {
    ...emptyPlanSections(),
    winners: {
      rivals: [{ contentItemId: a, ownerHandle: "rakip.bir", isOwn: false, lift: 3.4, analyzed: false }],
      own: [],
      relaxedThreshold: false,
    },
    focus: {
      directions: [{ group: "duration_bucket", value: "over_90", label: "90 sn ve üstü", impact: 1.23, novelty: 1.5, score: 1.85, sampleSize: 6, confidence: "medium", ownTried: false, evidenceContentIds: [a, b] }],
    },
    schedule: {
      postsPerWeek: 3,
      audienceTimeZone: input.timeZone,
      slots: [{ position: 1, at: slotAt, weekday: 2, hour: 19, basis: "rival_fixed", note: "Rakiplerin sabit saati" }],
    },
  };
  WEEKLY_PLAN_SECTIONS_SCHEMA.parse(sections);

  const idea = (title: string, evidence: string[], extra: Record<string, Json> = {}): Json => ({
    title,
    rationale: "Sözleşme testi: rakiplerde tutan yön.",
    platform: "instagram",
    format: "short_video",
    hook_type: "bold_claim",
    hooks: ["hook bir", "hook iki", "hook üç"],
    script_outline: ["giriş", "gelişme", "kapanış"],
    rank_score: 0.8,
    details: { script: "Tam konuşma metni.", scriptLanguage: "en", durationBucket: "60_90", quotes: [{ contentItemId: evidence[0], text: "Kısa alıntı." }], ownTried: false },
    evidence: evidence.map((id, i) => ({ content_item_id: id, lift_at_creation: 3.1 + i })),
    ...extra,
  });

  const payload: Json = {
    account_id: input.accountId,
    summary: "Sözleşme testi planı.",
    confidence: "medium",
    sections: sections as unknown as Json,
    taxonomy_version: "2026-10-v1",
    prompt_version: "plan-test",
    model: "test-model",
    run_ids: [],
    brief: planBriefToStorage(SEED_PLAN_BRIEF) as unknown as Json,
    ideas: [
      idea("Plana giren fikir 1", [a, b], { position: 1, slot_at: slotAt, slot_note: "Rakiplerin sabit saati", brief_slot: "S1" }),
      idea("Plana giren fikir 2", [b, c], { position: 2, brief_slot: "S2" }),
      idea("Aday fikir", [a, c]),
    ],
  };
  must(await db.rpc("save_weekly_plan", { p_ws: wsId, p_week: week, p_payload: payload }), "save_weekly_plan");

  const examples = input.ownContentIds.slice(0, 2).map((contentItemId) => ({ contentItemId, quote: "Kendi videodan birebir alıntı." }));
  const traits = ["quick-hook", "concrete-problem", "practical-step", "soft-cta", "calm-tone"].map((key) => ({
    key,
    label: key,
    description: "Sözleşme testi özelliği.",
    verified: true,
    examples,
  }));
  must(
    await db.from("voice_profiles").insert({
      workspace_id: wsId,
      social_account_id: input.accountId,
      platform: "instagram",
      language: "en",
      summary: "Sakin ve doğrudan.",
      traits,
      lexicon: { signaturePhrases: ["imza cümle"], avoidPhrases: ["mucize"] },
      stats: { sampleSize: examples.length, medianCaptionChars: 120, questionShare: 0.2 },
      sample_size: examples.length,
      taxonomy_version: "2026-10-v1",
      prompt_version: "voice-test",
      model: "test-model",
    }),
    "voice_profiles",
  );
}
