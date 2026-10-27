/**
 * Kreatif direktör (haftalık strateji brifi): analiz ile takvim arasındaki karar katmanı. TEK LLM turu (Claude CLI, abonelik) + kod
 * denetimi (`creative-brief-validate.ts`); eleştirmen turu yok. Model araçsızdır: kartlar, yönler, anatomi, ses, geçen hafta AYRI veri
 * blokları olarak girer. Çıktı brifi kurar (tema, sütun dağılımı, uyarlama/deneme oranı, tek deneme değişkeni, süreklilik, slot kararları);
 * sayıyı ve kimliği kod belirler/denetler. Denetimi geçmezse tek düzeltme turu (`review`), yine geçmezse `brief: undefined` döner:
 * çağıran planı brifsiz (bugünkü yolla) sürdürür. LLM hatası (`LlmError`) çağırana fırlar.
 */
import "server-only";

import { briefProblems, briefRatioTarget, finalizeBrief, MIN_CARDS_FOR_ADAPT, type BriefValidationContext } from "@/lib/llm/creative-brief-validate";
import { creativeBriefSchema, slotIdOf, TEST_VARIABLE_KINDS, type CreativeBrief } from "@/lib/llm/creative-brief-schema";
import type { PlanMode } from "@/lib/insights/mode";
import { clipForPrompt, dataBlock, HEDGED_CONFIDENCE_RULE, JSON_ONLY_RULE, NO_RIVALS_RULE, NO_STRAY_NUMBERS_RULE, PANEL_LANGUAGE_RULE, PLAIN_LANGUAGE_RULE, UNTRUSTED_DATA_RULE } from "@/lib/llm/prompt-blocks";
import type { LlmBackend, LlmCallMeta } from "@/lib/llm/types";

export const CREATIVE_BRIEF_PROMPT_VERSION = "creative-brief-v2";
const DEFAULT_TIMEOUT_MS = 300_000;

/** Modele giden veri blokları (hepsi düz, serileştirilebilir; metin alanları kırpılır). */
export interface CreativeBriefInput {
  slotCount: number;
  /** Plan modu: `own` = rakipsiz (metinde rakip anılmaz); verilmezse `rivals`. */
  mode?: PlanMode;
  /** Hesap amacı (`accountTypeProfile`) ve niş özeti: sütunlar buradan türer. */
  account: { type: string; purpose: string; contentMix: { reach: number; sales: number } };
  niche?: string;
  directions: readonly { ref: string; label: string; group: string; confidence: string; ownTried: boolean; rationale?: string }[];
  cards: readonly { id: string; label: string; kind: string; accounts: number; confidence: string; ownTried: boolean; medianLift: number }[];
  /** Anatomi reçetesinden kısa farklar (varsa). */
  anatomy: readonly string[];
  voiceSummary?: string;
  /** Geçen haftanın planı ve sonucu; plan yoksa undefined (süreklilik = ilk hafta). */
  lastWeek?: { weekStart: string; summary?: string; ideas: readonly string[]; verdicts: readonly string[] };
}

export interface CreativeBriefOutcome {
  /** Denetimden geçen brif; geçmediyse undefined (çağıran planı brifsiz sürdürür). */
  brief?: CreativeBrief;
  /** Son denemede de kalan sorunlar (brif yoksa sebep). */
  problems: string[];
  promptVersion: string;
  meta: LlmCallMeta;
}

function systemPrompt(slotCount: number, mode: PlanMode): string {
  const target = briefRatioTarget(slotCount);
  return [
    "You are the creative director of a short-form-video account. Between the analysis and the calendar you decide WHAT the week is about and WHY. You write a weekly brief with exactly five decisions:",
    "1. theme: the week's theme in ONE plain sentence.",
    `2. pillars: the content pillars of the week and how many slots each gets (pillar names come from <niche> and <account>.purpose; if <niche> names no pillars, derive them from the account's purpose). The counts add up to ${slotCount}.`,
    `3. ratio: about 70% of the slots adapt a proven idea (decision=adapt) and about 30% are experiments (decision=test). With ${slotCount} slots that is ${target.adapt} adapt and ${target.test} test slot(s). At least one test slot.`,
    `4. testVariable: the ONE thing tested this week; kind is exactly one of ${TEST_VARIABLE_KINDS.join(", ")}. Every test slot tries a value of that single variable (testValue); adapt slots carry no testValue.`,
    "5. continuity: how the week connects to <last_week> (mode=continue: carry a series or a lesson forward; mode=break: a deliberate change, say why). When <last_week> is null, mode is first_week.",
    "",
    `Slots: exactly ${slotCount}, slotId ${Array.from({ length: slotCount }, (_, i) => slotIdOf(i)).join(", ")} in calendar order. Every slot has: decision, pillar (spelled exactly like a name in pillars), why (one sentence), evidenceRef (copied from the input: a card id from <cards>, or a direction ref such as F1 from <directions>) and, for test slots, testValue.`,
    `An adapt slot cites the card it adapts (evidenceRef = that card's id). If <cards> has fewer than ${MIN_CARDS_FOR_ADAPT} cards, adapt slots may cite a direction ref instead. Each card is used for at most one slot; prefer cards the account has not tried yet (ownTried=false) unless continuing a series. A test slot cites the direction or card that suggests the experiment.`,
    "Use <anatomy> (what differs between this account's videos and the winners) and <voice> only as background for the reasons. Never invent a card id, direction ref or fact that is not in the input.",
    "",
    PLAIN_LANGUAGE_RULE,
    HEDGED_CONFIDENCE_RULE,
    ...(mode === "own" ? [NO_RIVALS_RULE] : []),
    `${NO_STRAY_NUMBERS_RULE} write NO digits, percentages, multipliers or number words anywhere in the text fields; describe strength in words. Do not write tokens or curly braces either.`,
    PANEL_LANGUAGE_RULE,
    UNTRUSTED_DATA_RULE,
    JSON_ONLY_RULE,
  ].join("\n");
}

function buildPayload(input: CreativeBriefInput): string {
  return [
    dataBlock("week", { slotCount: input.slotCount, planMode: input.mode ?? "rivals", slotIds: Array.from({ length: input.slotCount }, (_, i) => slotIdOf(i)), ratioTarget: briefRatioTarget(input.slotCount) }),
    dataBlock("account", input.account),
    input.niche?.trim() ? dataBlock("niche", clipForPrompt(input.niche.trim(), 2000)) : undefined,
    dataBlock("directions", input.directions.map((d) => ({ ...d, rationale: clipForPrompt(d.rationale, 300) }))),
    dataBlock("cards", input.cards),
    dataBlock("anatomy", input.anatomy.map((line) => clipForPrompt(line, 300))),
    input.voiceSummary?.trim() ? dataBlock("voice", clipForPrompt(input.voiceSummary.trim(), 600)) : undefined,
    dataBlock("last_week", input.lastWeek === undefined ? null : { ...input.lastWeek, summary: clipForPrompt(input.lastWeek.summary, 500) }),
  ]
    .filter((block): block is string => block !== undefined)
    .join("\n\n");
}

/** Denetim bağlamı: girdideki kart / yön kimlikleri ve geçen hafta bilgisi. */
export function briefContextOf(input: CreativeBriefInput): BriefValidationContext {
  return {
    slotCount: input.slotCount,
    cards: new Map(input.cards.map((card) => [card.id, card.label])),
    directions: new Map(input.directions.map((direction) => [direction.ref, direction.label])),
    hasLastWeek: input.lastWeek !== undefined,
    mode: input.mode ?? "rivals",
    confidence: new Map([...input.cards.map((card) => [card.id, card.confidence] as const), ...input.directions.map((direction) => [direction.ref, direction.confidence] as const)]),
  };
}

export interface CreativeBriefOptions {
  timeoutMs?: number;
  model?: string;
}

export async function createCreativeBrief(backend: LlmBackend, input: CreativeBriefInput, options: CreativeBriefOptions = {}): Promise<CreativeBriefOutcome> {
  const ctx = briefContextOf(input);
  const { value, meta } = await backend.runJson({
    task: "llm_week_synthesis", // ayrı tür (`llm_creative_brief`) `domain/run.ts`'e dokunmayı gerektirir: RAPOR "Bekleyen"; etiket ayırt eder
    system: systemPrompt(input.slotCount, input.mode ?? "rivals"),
    input: buildPayload(input),
    schema: creativeBriefSchema,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    model: options.model,
    review: (output) => {
      const problems = briefProblems(output, ctx);
      return problems.length === 0 ? undefined : `Brif kod denetiminden geçmedi; tüm brifi yeniden yaz:\n${problems.map((problem) => `- ${problem}`).join("\n")}`;
    },
    reviewFailure: "accept",
  });
  const problems = briefProblems(value, ctx);
  return { brief: problems.length === 0 ? finalizeBrief(value, ctx) : undefined, problems, promptVersion: CREATIVE_BRIEF_PROMPT_VERSION, meta };
}
