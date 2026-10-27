/**
 * Görev 4 — haftalık plan metinleri (`llm_week_synthesis`): C'nin deterministik taslağı (`WeeklyPlanSections`: tutanlar, yönler,
 * kaçınılacaklar; sayı ve id'lerin hepsi kodun) ve kanıt korpusu girer; çıkan: "neden tuttu" + alıntı, yönlerin gerekçesi (+ alıntı),
 * kaçınma metni ve plan özeti. LLM SAYIYA VE ID'YE DOKUNAMAZ: çıktı şeması sayısal alan içermez, id/ref kümesi girdiyle birebir
 * karşılaştırılır, alıntılar korpusta doğrulanır, sonuç taslakla metin alanları dışında birebir eşit olmalı ve
 * `WEEKLY_PLAN_SECTIONS_SCHEMA`'dan geçmelidir (ayrıntı: `synthesize-week-output.ts`).
 *
 * Hata davranışı: id/ref kümesi uyuşmazsa (sert) 1 düzeltme turu, sonra `invalid_output`; tek bir metnin bozukluğu (alıntı
 * bulunamadı, metinde çarpan/yüzde var) yumuşaktır: o metin atılır (`dropped`), plan yine çıkar. Analiz edilmemiş tutanın
 * "neden tuttu"su yoktur (`analyzed: false`): modele gitmez.
 */
import "server-only";

import { WEEKLY_PLAN_SECTIONS_SCHEMA } from "@/lib/data/weekly-plan-schema";
import type { WeeklyPlanSections } from "@/lib/domain/weekly-plan";
import { indexById } from "@/lib/llm/content-text";
import { clipForPrompt, dataBlock, JSON_ONLY_RULE, PANEL_LANGUAGE_RULE, UNTRUSTED_DATA_RULE, VERBATIM_QUOTE_RULE } from "@/lib/llm/prompt-blocks";
import {
  analyzeSynthesis,
  buildTargets,
  isEmptyTargets,
  mergeSynthesis,
  SYNTHESIS_OUTPUT_SCHEMA,
  synthesisProblem,
  type WeekContent,
  type WeekTargets,
} from "@/lib/llm/synthesize-week-output";
import { LlmError, type LlmBackend, type LlmCallMeta } from "@/lib/llm/types";

export const PROMPT_VERSION = "synthesize-week-v1";
const DEFAULT_TIMEOUT_MS = 240_000;
const TRANSCRIPT_CHARS = 2500;
const TEXT_CHARS = 600;

export interface SynthesizeWeekInput {
  /** C'nin deterministik taslağı: sayılar, id'ler, sıralama KESİNDİR. */
  draft: WeeklyPlanSections;
  /** Tutanların ve yön kanıtlarının metinleri (transcript/açıklama/ekran yazısı); korpusu olmayan içerik için metin yazılmaz. */
  corpus: readonly WeekContent[];
  /** Niş özeti (isteğe bağlı bağlam). */
  niche?: string;
}

export interface WeekSynthesis {
  /** Taslak + doğrulanmış metinler (`WEEKLY_PLAN_SECTIONS_SCHEMA`'dan geçmiş). */
  sections: WeeklyPlanSections;
  /** Plan özeti (`WeeklyPlan.summary`); üretilemedi/denetimden geçmediyse undefined. */
  summary?: string;
  /** Atılan metinler ve sebepleri (Türkçe). */
  dropped: string[];
  promptVersion: string;
  /** Yazılacak metin yoksa (model çağrılmadı) undefined. */
  meta?: LlmCallMeta;
}

const SYSTEM_PROMPT = [
  "You write the explanatory TEXT of a weekly content plan for a short-form-video creator. Every number, ranking and id was computed by code and is final: you never calculate, change or restate a number. Do not write multipliers (3x, 4 kat), percentages or counts; describe strength in words (clearly above average, only a weak signal).",
  "",
  "Inputs: <winners> (videos that outperformed), <directions> (what to lean into this week), <avoid> (what to steer away from), <contents> (the source text of those videos).",
  "Write:",
  "1. summary: 2-3 sentences: what worked and what to lean into this week.",
  "2. winners: for EACH winner id: why (1-2 sentences on why THIS video worked, grounded in what it actually says or does) and quote (a verbatim passage of at most 200 characters from that video's own text that shows it).",
  "3. focus: for EACH direction ref: rationale (1-2 sentences on why to lean into it; if confidence is low, say it is a weak signal) and a quote copied from one of that direction's evidence videos (quoteFrom = that video's id).",
  "4. avoid: for EACH avoid ref: reason (one plain sentence on why to steer away; do not repeat the numbers in draftReason).",
  "",
  "Return exactly one entry per id/ref given: no missing, no extra, no duplicates. Never invent an id or ref. Base claims only on the given text and fields.",
  VERBATIM_QUOTE_RULE,
  PANEL_LANGUAGE_RULE,
  UNTRUSTED_DATA_RULE,
  JSON_ONLY_RULE,
].join("\n");

/** Modele giden bloklar: yalnız bağlam sayıları (nitel değerlendirme için); model bunları yazmaz. */
function buildPayload(input: SynthesizeWeekInput, targets: WeekTargets, contents: ReadonlyMap<string, WeekContent>): string {
  const { draft } = input;
  const winnerIds = new Set(targets.winnerIds);
  const winners = [...draft.winners.rivals, ...draft.winners.own]
    .filter((winner, index, all) => winnerIds.has(winner.contentItemId) && all.findIndex((other) => other.contentItemId === winner.contentItemId) === index)
    .map((winner) => ({ id: winner.contentItemId, ownerHandle: winner.ownerHandle, isOwn: winner.isOwn, lift: winner.lift, hookType: winner.hookType, durationSec: winner.durationSec }));
  const directions = targets.focus.map((target) => {
    const direction = draft.focus.directions[target.index];
    return {
      ref: target.ref,
      group: direction.group,
      label: direction.label,
      sampleSize: direction.sampleSize,
      confidence: direction.confidence,
      ownTried: direction.ownTried,
      impact: direction.impact,
      evidenceIds: target.evidenceIds,
    };
  });
  const avoid = targets.avoid.map((target) => {
    const entry = draft.avoid.entries[target.index];
    return { ref: target.ref, kind: entry.kind, group: entry.group, label: entry.label, sampleSize: entry.sampleSize, confidence: entry.confidence, medianLift: entry.medianLift, draftReason: entry.reason };
  });
  const contentIds = [...new Set([...targets.winnerIds, ...targets.focus.flatMap((target) => target.evidenceIds)])];
  const texts = contentIds.map((id) => {
    const content = contents.get(id) as WeekContent;
    return {
      id,
      ownerHandle: content.ownerHandle,
      caption: clipForPrompt(content.caption, TEXT_CHARS),
      transcript: clipForPrompt(content.transcript, TRANSCRIPT_CHARS),
      screenText: clipForPrompt(content.screenText, TEXT_CHARS),
    };
  });
  return [
    input.niche?.trim() ? dataBlock("niche", input.niche.trim()) : undefined,
    dataBlock("winners", winners),
    dataBlock("directions", directions),
    dataBlock("avoid", avoid),
    dataBlock("contents", texts),
  ]
    .filter((block): block is string => block !== undefined)
    .join("\n\n");
}

export interface SynthesizeWeekOptions {
  timeoutMs?: number;
  model?: string;
}

export async function synthesizeWeek(backend: LlmBackend, input: SynthesizeWeekInput, options: SynthesizeWeekOptions = {}): Promise<WeekSynthesis> {
  const draft = WEEKLY_PLAN_SECTIONS_SCHEMA.safeParse(input.draft);
  if (!draft.success) throw new LlmError("invalid_input", "Plan taslağı bölüm şemasına uymuyor.");
  const contents = indexById(input.corpus);
  const targets = buildTargets(draft.data, contents);
  if (isEmptyTargets(targets)) return { sections: draft.data, dropped: [], promptVersion: PROMPT_VERSION };

  const { value, meta } = await backend.runJson({
    task: "llm_week_synthesis",
    system: SYSTEM_PROMPT,
    input: buildPayload({ ...input, draft: draft.data }, targets, contents),
    schema: SYNTHESIS_OUTPUT_SCHEMA,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    model: options.model,
    review: (output) => synthesisProblem(analyzeSynthesis(output, targets, contents)),
    reviewFailure: "accept",
  });

  const analysis = analyzeSynthesis(value, targets, contents);
  if (analysis.hard.length > 0) throw new LlmError("invalid_output", `Plan metni girdiyle uyuşmuyor: ${analysis.hard.join(" ")}`, meta);
  return { sections: mergeSynthesis(draft.data, analysis, contents), summary: analysis.summary, dropped: analysis.soft, promptVersion: PROMPT_VERSION, meta };
}
