/**
 * `save_weekly_plan` RPC yükü (saf): üretilen fikirleri sıralar, plana 3–5 tanesini alır (`position` + takvim slotu), adayları
 * `position` vermeden yazar. Sıra puanı = rakip kanıtlarının ortalama lift'i × yenilik (kendi hesap yönü denemediyse 1,5). Lift'i ölçülemeyen
 * kanıt ortalamaya girmez (undefined ≠ 0); hiç ölçülemiyorsa puan 0 (fikir yine listelenir, plana en sonda girer).
 * Rakipsiz mod (`mode = "own"`): puan = KENDİ kanıtlarının ortalama lift'i (yenilik çarpanı yok); mod fikre (`rank_inputs.mode`, `details.planMode`) yazılır.
 * Karma hesapta (`mixed`) plana girecek fikirler `slotPurposes` (erişim/satış) sırasına göre seçilir; fikrin amacı `details.purpose`'a yazılır.
 * Kreatif direktör brifi (`options.brief`): plana girenler brif slot sırasındadır (`orderForBrief`: slot başına en yüksek puanlı fikir), slotun "neden"i
 * `slot_note`a eklenir; fikrin slotu `brief_slot` RPC yüküne gider (`weekly_plan_items.brief_slot`), brifin kendisi `PlanPayload.brief`'e (`weekly_plans.brief`; 0025). Brif yoksa sıralama değişmez.
 * Şema: supabase/migrations/0007_intel_v2.sql `save_weekly_plan`.
 */
import { type AccountType } from "@/lib/domain/account-type";
import type { IdeaDetails } from "@/lib/domain/intel";
import { PLAN_POSTS_MAX, PLAN_POSTS_MIN, SLOT_BASIS_LABEL, type ConfidenceLevel, type ScheduleSlot, type WeeklyPlanSections } from "@/lib/domain/weekly-plan";
import type { PlanMode } from "@/lib/insights/mode";
import { PURPOSE_LABEL, purposeOfType, slotPurposes, type SlotPurpose } from "@/lib/insights/slot-mix";
import type { planBriefToStorage } from "@/lib/data/weekly-plan-schema";
import type { Platform } from "@/lib/platforms/types";
import type { CreativeBrief } from "@/lib/llm/creative-brief-schema";
import type { GeneratedIdea } from "@/lib/llm/generate-ideas-validate";

export const NOVELTY_UNTRIED = 1.5;

/** Fikrin `details` jsonb'si: `IdeaDetails` + plan amacı/modu (okuyan eşleyici bilinmeyen alanı yok sayar; alan `IdeaDetails`'e eklenince görünür). */
export type PayloadDetails = IdeaDetails & { purpose?: SlotPurpose; planMode?: PlanMode };

export interface PayloadIdea {
  title: string;
  rationale: string;
  /** Planın hesabının platformu (fikir o platform için yazılır). */
  platform: Platform;
  format: "short_video";
  hook_type: string;
  hooks: string[];
  script_outline: string[];
  rank_score: number;
  rank_inputs: { meanRivalLift: number | null; novelty: number; directionRef: string | null; relaxedOutlier: boolean; meanOwnLift?: number | null; mode?: PlanMode; purpose?: SlotPurpose | null };
  details: PayloadDetails;
  source: "weekly_plan";
  evidence: { content_item_id: string; lift_at_creation?: number }[];
  /** Fikrin doldurduğu brif slotu (`S1..`); brifsiz planda yok. `weekly_plan_items.brief_slot`a yazılır (0025). */
  brief_slot?: string;
  position?: number;
  slot_at?: string;
  slot_note?: string;
}

export interface PlanPayload {
  account_id?: string;
  status: "draft" | "ready";
  summary?: string;
  confidence: ConfidenceLevel;
  sections: WeeklyPlanSections;
  taxonomy_version: string;
  prompt_version: string;
  model?: string;
  run_ids: string[];
  /** Denetimden geçmiş Kreatif direktör brifi (sürümlü; `planBriefToStorage`); brifsiz planda yok → `weekly_plans.brief` NULL. */
  brief?: ReturnType<typeof planBriefToStorage>;
  ideas: PayloadIdea[];
}

export interface RankedIdea {
  idea: GeneratedIdea;
  score: number;
  meanRivalLift?: number;
  /** Kendi kanıtlarının ortalama lift'i (rakipsiz modda puanın kaynağı; rakip modunda bilgi). */
  meanOwnLift?: number;
  novelty: number;
  mode: PlanMode;
}

const meanOf = (lifts: readonly number[]): number | undefined => (lifts.length === 0 ? undefined : lifts.reduce((a, b) => a + b, 0) / lifts.length);

/** Kanıt içeriklerinin hangisi rakip olduğunu bilmek için çağıran `isOwn` verir. Rakipsiz modda puan kendi kanıt ortalamasıdır, yenilik 1. */
export function rankIdeas(ideas: readonly GeneratedIdea[], isOwn: (contentId: string) => boolean, mode: PlanMode = "rivals"): RankedIdea[] {
  return ideas
    .map((idea): RankedIdea => {
      const liftsOf = (own: boolean) => idea.evidence.filter((e) => isOwn(e.contentItemId) === own && e.liftAtCreation !== undefined).map((e) => e.liftAtCreation as number);
      const meanRivalLift = meanOf(liftsOf(false));
      const meanOwnLift = meanOf(liftsOf(true));
      const novelty = mode === "rivals" && idea.details.ownTried === false ? NOVELTY_UNTRIED : 1;
      return { idea, meanRivalLift, meanOwnLift, novelty, mode, score: ((mode === "own" ? meanOwnLift : meanRivalLift) ?? 0) * novelty };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * Plana girecek `planned` fikri amaç sırasına göre öne alır (yalnız karma hesap: `purposeOfType` undefined): slot i, `purposes[i]` amacındaki en
 * yüksek puanlı kalan fikri alır; o amaçta fikir kalmadıysa en yüksek puanlı kalan alınır. Kalanlar puan sırasında aday olur.
 */
export function orderForSlots(ranked: readonly RankedIdea[], planned: number, accountType: AccountType | undefined): RankedIdea[] {
  if (accountType === undefined || purposeOfType(accountType) !== undefined) return [...ranked];
  const rest = [...ranked];
  const chosen: RankedIdea[] = [];
  for (const purpose of slotPurposes(accountType, planned)) {
    if (rest.length === 0) break;
    const at = rest.findIndex((r) => r.idea.purpose === purpose);
    chosen.push(...rest.splice(at < 0 ? 0 : at, 1));
  }
  return [...chosen, ...rest];
}

/**
 * Brifli sıralama: slot S1..Sn sırasıyla her slota o slotun en yüksek puanlı fikri atanır (bir fikir tek slota); fikri olmayan slot atlanır.
 * `chosen` plana girecek fikirlerdir (brif sırasında), `ordered` = chosen + kalanlar (puan sırasında, aday olur).
 */
export function orderForBrief(ranked: readonly RankedIdea[], brief: CreativeBrief): { ordered: RankedIdea[]; chosen: number } {
  const rest = [...ranked];
  const chosen: RankedIdea[] = [];
  for (const slot of brief.slots) {
    const at = rest.findIndex((r) => r.idea.slotId === slot.slotId);
    if (at >= 0) chosen.push(...rest.splice(at, 1));
  }
  return { ordered: [...chosen, ...rest], chosen: chosen.length };
}

/** Plana alınacak fikir sayısı: takvim adedi (3–5), eldeki fikirden fazla olamaz. */
export function plannedCount(postsPerWeek: number, available: number): number {
  return Math.min(Math.max(postsPerWeek, PLAN_POSTS_MIN), PLAN_POSTS_MAX, available);
}

export function slotNote(slot: ScheduleSlot): string {
  return slot.note?.trim() ? slot.note : SLOT_BASIS_LABEL[slot.basis];
}

export function toPayloadIdeas(ranked: readonly RankedIdea[], schedule: WeeklyPlanSections["schedule"], options: { accountType?: AccountType; platform?: Platform; brief?: CreativeBrief } = {}): PayloadIdea[] {
  const { brief } = options;
  const byBrief = brief === undefined ? undefined : orderForBrief(ranked, brief);
  const planned = Math.min(plannedCount(schedule.postsPerWeek, ranked.length), byBrief?.chosen ?? Infinity);
  const mixed = options.accountType !== undefined && purposeOfType(options.accountType) === undefined;
  return (byBrief?.ordered ?? orderForSlots(ranked, planned, options.accountType)).map(({ idea, score, meanRivalLift, meanOwnLift, novelty, mode }, index) => {
    const position = index < planned ? index + 1 : undefined;
    const slot = position === undefined ? undefined : schedule.slots.find((s) => s.position === position);
    const purposeNote = mixed && idea.purpose !== undefined ? ` · ${PURPOSE_LABEL[idea.purpose]} içeriği` : "";
    const briefWhy = position === undefined ? undefined : brief?.slots.find((s) => s.slotId === idea.slotId)?.why;
    return {
      title: idea.title,
      rationale: idea.rationale,
      // Verilmezse eski davranış (Instagram): çağıran (plan koşusu) hesabın platformunu geçirir.
      platform: options.platform ?? "instagram",
      format: "short_video",
      hook_type: idea.hookType,
      hooks: idea.hooks,
      script_outline: idea.scriptOutline,
      rank_score: Math.round(score * 1000) / 1000,
      rank_inputs: { meanRivalLift: meanRivalLift ?? null, novelty, directionRef: idea.directionRef ?? null, relaxedOutlier: idea.relaxedOutlier, meanOwnLift: meanOwnLift ?? null, mode, purpose: idea.purpose ?? null },
      details: { ...idea.details, ...(idea.purpose === undefined ? {} : { purpose: idea.purpose }), planMode: mode },
      source: "weekly_plan",
      evidence: idea.evidence.map((e) => ({ content_item_id: e.contentItemId, ...(e.liftAtCreation === undefined ? {} : { lift_at_creation: e.liftAtCreation }) })),
      ...(brief === undefined || idea.slotId === undefined ? {} : { brief_slot: idea.slotId }),
      ...(position === undefined ? {} : { position }),
      ...(slot === undefined ? {} : { slot_at: slot.at, slot_note: `${slotNote(slot)}${purposeNote}${briefWhy === undefined ? "" : ` · ${briefWhy}`}` }),
    };
  });
}
