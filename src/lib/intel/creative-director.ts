/**
 * Kreatif direktör yapıştırıcısı: haftalık planın girdilerini (yönler, 06 kanıtlanmış fikir kartları, anatomi reçetesi, ses, geçen haftanın
 * planı ve sonucu, hesap amacı) toplar, brifi tek LLM turuyla üretir (`llm/creative-brief.ts`), denetler ve koşuyu kaydeder. Brif üretilemezse
 * (LLM hatası ya da denetimi geçmedi) `undefined` döner ve sebep plan notuna yazılır: plan bugünkü yoldan (brifsiz) sürer. Okuma salt okunurdur
 * (06 kartları yalnız okunur); DB'ye brif YAZILMAZ (yalnız abonelik koşu satırı). Abonelik: 0 USD.
 * Koşu türü: `llm_week_synthesis` + "kreatif direktör brifi" etiketi (ayrı `llm_creative_brief` türü `domain/run.ts`'e dokunmayı gerektirir: RAPOR "Bekleyen").
 */
import "server-only";

import { accountTypeProfile } from "@/lib/domain/account-type";
import type { AnatomyReport } from "@/lib/domain/anatomy";
import { hookTypeLabel } from "@/lib/domain/hook-types";
import { focusDirectionRef, PLAN_POSTS_MAX, type WeeklyPlanSections } from "@/lib/domain/weekly-plan";
import { previousWeeks, type FeedbackReview } from "@/lib/insights";
import type { DirectionReview } from "@/lib/domain/outcomes";
import type { IntelContext } from "@/lib/intel/context";
import { plannedCount } from "@/lib/intel/plan-payload";
import { createProvenIdeasReaders, loadProvenIdeas } from "@/lib/intel/proven-ideas-load";
import type { ProvenIdea } from "@/lib/intel/proven-ideas-types";
import { recordFailedLlmRun, recordLlmRun } from "@/lib/intel/run-log";
import type { PlanMode } from "@/lib/insights/mode";
import { createCreativeBrief, type CreativeBriefInput } from "@/lib/llm/creative-brief";
import type { CreativeBrief } from "@/lib/llm/creative-brief-schema";
import { LlmError, type LlmBackend, type LlmCallMeta } from "@/lib/llm/types";

/** Brife girecek en çok kart sayısı (en sağlamlar: önce `proven`, sonra hesap sayısı ve lift medyanı). */
export const BRIEF_CARDS_MAX = 8;
const RUN_LABEL = "kreatif direktör brifi";

export interface DirectedBrief {
  brief: CreativeBrief;
  /** Brif kanıt ref'i (kart kimliği / yön `F1..`) → kanıt içerik kimlikleri: fikir üretiminin kanıt havuzuna ve istemine girer. */
  evidenceByRef: Record<string, string[]>;
  /** Brif kanıt ref'i → güven derecesi (fikir üretiminde kesinlik sözü denetimi). */
  confidenceByRef: Record<string, string>;
  /** Brife giren kart sayısı ve ham kart sayısı (RAPOR için). */
  cardCount: number;
}

export interface DirectBriefParams {
  weekStart: string;
  sections: WeeklyPlanSections;
  /** Plan modu (`own` = rakipsiz: brif metninde rakip anılmaz); verilmezse `rivals`. */
  mode?: PlanMode;
  /** Geçen haftaların plan sonucu (geri besleme okuması; `loadFeedback`). */
  reviews: readonly FeedbackReview[];
  voiceSummary?: string;
  notes: string[];
  runIds: string[];
  log: (line: string) => void;
}

/** Dış bağımlılıklar (testte sahtesi verilir; varsayılanlar `ctx`'ten): her biri `directBrief` içinde en çok bir kez çağrılır. */
export interface DirectorDeps {
  cards(): Promise<ProvenIdea[]>;
  anatomy(): Promise<AnatomyReport | undefined>;
  lastWeek(weekStart: string): Promise<{ summary?: string; ideas: string[] } | undefined>;
  record(meta: LlmCallMeta): Promise<string>;
  recordFailure(message: string): Promise<void>;
}

export function defaultDirectorDeps(ctx: IntelContext): DirectorDeps {
  return {
    cards: async () => (await loadProvenIdeas(createProvenIdeasReaders({ client: ctx.client, repo: ctx.repo, workspaceId: ctx.workspaceId }), { now: ctx.now })).ideas,
    anatomy: async () => {
      try {
        return await ctx.repo.getAnatomy(ctx.workspaceId);
      } catch {
        return undefined; // anatomi yalnız arka plan bilgisidir: okunamazsa brif onsuz kurulur
      }
    },
    lastWeek: async (weekStart) => {
      const plan = await ctx.repo.getWeeklyPlan(ctx.workspaceId, weekStart);
      return plan === null ? undefined : { summary: plan.summary, ideas: [...plan.items, ...plan.alternatives].map((item) => item.idea.title) };
    },
    record: (meta) => recordLlmRun(ctx.client, ctx.workspaceId, meta, RUN_LABEL),
    recordFailure: (message) => recordFailedLlmRun(ctx.client, ctx.workspaceId, "llm_week_synthesis", RUN_LABEL, message),
  };
}

/** Geçen haftanın bir yönünün sonucu tek cümleyle (tuttu / tutmadı / ölçülemedi sayıları sözle verilir: rakamsız kural). */
function verdictLine(d: DirectionReview): string {
  const outcome = d.held > 0 && d.missed === 0 ? "tuttu" : d.missed > 0 && d.held === 0 ? "tutmadı" : d.held > 0 ? "karışık sonuç verdi" : "ölçülemedi";
  return `${d.label}: ${outcome}`;
}

const cardRank = (a: ProvenIdea, b: ProvenIdea): number =>
  Number(b.kind === "proven") - Number(a.kind === "proven") || b.accountCount - a.accountCount || b.medianLift - a.medianLift || a.id.localeCompare(b.id);

/** Brif girdisi (saf): kartlar sıralanıp kısaltılır, yönlere `F1..` ref'i verilir, kanıt kimlikleri ref'e bağlanır. */
export function briefInputOf(args: {
  slotCount: number;
  mode?: PlanMode;
  accountType: Parameters<typeof accountTypeProfile>[0];
  niche?: string;
  sections: WeeklyPlanSections;
  cards: readonly ProvenIdea[];
  anatomy?: AnatomyReport;
  voiceSummary?: string;
  lastWeek?: { weekStart: string; summary?: string; ideas: string[]; verdicts: string[] };
}): { input: CreativeBriefInput; evidenceByRef: Record<string, string[]>; confidenceByRef: Record<string, string>; cardCount: number } {
  const profile = accountTypeProfile(args.accountType);
  const cards = [...args.cards].sort(cardRank).slice(0, BRIEF_CARDS_MAX);
  const evidenceByRef: Record<string, string[]> = {};
  const confidenceByRef: Record<string, string> = {};
  for (const card of cards) {
    evidenceByRef[card.id] = card.evidence.slice(0, 4).map((e) => e.contentItemId);
    confidenceByRef[card.id] = card.confidence;
  }
  const directions = args.sections.focus.directions.map((direction, index) => {
    const ref = focusDirectionRef(index);
    evidenceByRef[ref] = [...direction.evidenceContentIds];
    confidenceByRef[ref] = direction.confidence;
    return { ref, label: direction.label, group: direction.group, confidence: direction.confidence, ownTried: direction.ownTried, rationale: direction.rationale };
  });
  const anatomy = (args.anatomy?.recipe.differences ?? []).filter((d) => d.text !== undefined).slice(0, 4).map((d) => `${d.label}: ${d.text}`);
  return {
    input: {
      slotCount: args.slotCount,
      mode: args.mode,
      account: { type: args.accountType, purpose: profile.purpose, contentMix: { ...profile.contentMix } },
      niche: args.niche,
      directions,
      cards: cards.map((card) => ({ id: card.id, label: `${card.cellLabel} · ${hookTypeLabel(card.hookType)}`, kind: card.kind, accounts: card.accountCount, confidence: card.confidence, ownTried: card.ownTried, medianLift: Math.round(card.medianLift * 10) / 10 })),
      anatomy,
      voiceSummary: args.voiceSummary,
      lastWeek: args.lastWeek,
    },
    evidenceByRef,
    confidenceByRef,
    cardCount: cards.length,
  };
}

/**
 * Brifi üretir. `undefined` = brif yok (plan brifsiz sürer); sebep `notes`a yazılır. Kuru koşuda (LLM yok) çağrılmaz.
 * Her LLM çağrısı abonelik koşusu olarak kaydedilir ve `runIds`'e eklenir.
 */
export async function directBrief(ctx: IntelContext, llm: LlmBackend, params: DirectBriefParams, deps: DirectorDeps = defaultDirectorDeps(ctx)): Promise<DirectedBrief | undefined> {
  const { notes, log } = params;
  try {
    const slotCount = plannedCount(params.sections.schedule.postsPerWeek, PLAN_POSTS_MAX);
    const [cards, anatomy] = await Promise.all([deps.cards(), deps.anatomy()]);
    const previous = previousWeeks(params.weekStart)[0];
    const last = previous === undefined ? undefined : await deps.lastWeek(previous);
    const verdicts = (params.reviews.find((review) => review.weekStart === previous)?.directions ?? []).map(verdictLine);
    const built = briefInputOf({
      slotCount,
      mode: params.mode,
      accountType: ctx.workspace.accountType,
      niche: ctx.workspace.nicheBrief,
      sections: params.sections,
      cards,
      anatomy,
      voiceSummary: params.voiceSummary,
      lastWeek: previous === undefined || last === undefined ? undefined : { weekStart: previous, summary: last.summary, ideas: last.ideas, verdicts },
    });
    if (built.input.cards.length === 0 && built.input.directions.length === 0) {
      notes.push("Kreatif direktör brifi atlandı: dayanak olacak kanıtlanmış fikir kartı ya da yön yok (model olmayan dayanak uydurmasın diye çağrı yapılmadı): plan brifsiz, bugünkü yolla üretildi.");
      return undefined;
    }
    log(`Kreatif direktör brifi (${slotCount} slot, ${built.cardCount} kart, ${built.input.directions.length} yön, geçen hafta ${built.input.lastWeek === undefined ? "yok" : "var"})...`);
    const outcome = await createCreativeBrief(llm, built.input, {});
    params.runIds.push(await deps.record(outcome.meta));
    if (outcome.brief === undefined) {
      notes.push(`Kreatif direktör brifi kod denetiminden geçmedi (${outcome.problems.slice(0, 3).join("; ")}): plan brifsiz, bugünkü yolla üretildi.`);
      return undefined;
    }
    notes.push(`Kreatif direktör brifi üretildi: ${outcome.brief.ratio.adapt} uyarlama + ${outcome.brief.ratio.test} deneme slotu${outcome.brief.evidenceThin ? "; kanıtlanmış fikir az (yönler ve kendi tutanlarla dolduruldu)" : ""}.`);
    return { brief: outcome.brief, evidenceByRef: built.evidenceByRef, confidenceByRef: built.confidenceByRef, cardCount: built.cardCount };
  } catch (error) {
    if (!(error instanceof LlmError)) {
      notes.push(`Kreatif direktör brifi kurulamadı: ${error instanceof Error ? error.message : "bilinmeyen hata"}; plan brifsiz, bugünkü yolla üretildi.`);
      return undefined;
    }
    notes.push(`Kreatif direktör brifi: ${error.message}; plan brifsiz, bugünkü yolla üretildi.`);
    await deps.recordFailure(error.message);
    return undefined;
  }
}
