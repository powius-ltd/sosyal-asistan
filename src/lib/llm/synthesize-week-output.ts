/**
 * `synthesize-week` çıktı sözleşmesi: şema, hedef kümeleri, kod denetimi ve birleştirme. Saf; LLM ve DB yok.
 *
 * İlke: sayı ve id'ler KODUN (plan taslağı `WeeklyPlanSections`, `lib/insights`); LLM yalnız dört metni yazar — "neden tuttu"
 * (+ alıntı), yönün gerekçesi (+ alıntı), kaçınma metni, plan özeti. Bunu üç katman garantiler:
 *  1. Şema katı (`strictObject`) ve HİÇ sayısal alan içermez: model `lift`/`views` gibi bir alan döndürürse çıktı reddedilir.
 *  2. Çıktının id/ref kümesi girdiyle BİREBİR karşılaştırılır (eksik/fazla/yinelenen → sert hata, düzeltme turu, sonra `invalid_output`).
 *  3. Birleştirme taslağın kopyasına yalnız `why`/`quote`/`rationale`/`rationaleQuote`/`reason` yazar; sonuçta taslak ile sonuç bu alanlar dışında
 *     birebir eşit olmalı (`assertDraftIntact`) ve `WEEKLY_PLAN_SECTIONS_SCHEMA`'dan geçmeli.
 * Metin denetimi (metin başına, YUMUŞAK: bozuk metin atılır, plan yine çıkar): alıntı ≤ 200 karakter ve ilgili içeriğin korpusunda
 * birebir; metinde çarpan/yüzde yok ("3x", "%60", "4 kat": sayıları panel gösterir, model uydurabilir).
 */
import "server-only";

import { isDeepStrictEqual } from "node:util";

import { z } from "zod";

import { WEEKLY_PLAN_SECTIONS_SCHEMA } from "@/lib/data/weekly-plan-schema";
import { RIVAL_QUOTE_MAX } from "@/lib/domain/intel";
import type { WeeklyPlanSections } from "@/lib/domain/weekly-plan";
import { checkQuote, hasAnyText, idSetProblem, type ContentText } from "@/lib/llm/content-text";
import { LlmError } from "@/lib/llm/types";

/** Plan kanıt korpusundaki içerik: metinler + sahibi (alıntı ekranda "@sahip" ile gösterilir). */
export interface WeekContent extends ContentText {
  ownerHandle?: string;
}

export const SYNTHESIS_OUTPUT_SCHEMA = z.strictObject({
  summary: z.string().min(1).max(500).describe("2-3 Turkish sentences, no numbers"),
  winners: z.array(
    z.strictObject({
      id: z.string().describe("Winner content id, copied exactly"),
      why: z.string().min(1).max(400).describe("Turkish, 1-2 sentences"),
      quote: z.string().min(1).max(RIVAL_QUOTE_MAX).describe("Verbatim passage from that video's own text"),
    }),
  ),
  focus: z.array(
    z.strictObject({
      ref: z.string().describe("Direction ref (F1, F2 ...), copied exactly"),
      rationale: z.string().min(1).max(400).describe("Turkish, 1-2 sentences"),
      quoteFrom: z.string().describe("Id of one of this direction's evidence videos"),
      quote: z.string().min(1).max(RIVAL_QUOTE_MAX).describe("Verbatim passage from that evidence video"),
    }),
  ),
  avoid: z.array(z.strictObject({ ref: z.string().describe("Avoid ref (A1, A2 ...), copied exactly"), reason: z.string().min(1).max(300).describe("Turkish, 1 sentence") })),
});
export type SynthesisOutput = z.infer<typeof SYNTHESIS_OUTPUT_SCHEMA>;

// --------------------------------------------------------------------- Hedefler

export interface FocusTarget {
  ref: string;
  /** Taslaktaki dizin. */
  index: number;
  /** Korpusu olan kanıt içerik id'leri (alıntı yalnız bunlardan). */
  evidenceIds: string[];
}

export interface WeekTargets {
  /** Metin yazılacak tutanlar: analiz edilmiş ve korpusu olanlar. */
  winnerIds: string[];
  focus: FocusTarget[];
  /** `A1..An`, taslak sırasıyla. */
  avoid: { ref: string; index: number }[];
}

const hasCorpus = (contents: ReadonlyMap<string, WeekContent>, id: string): boolean => {
  const content = contents.get(id);
  return content !== undefined && hasAnyText(content);
};

export function buildTargets(draft: WeeklyPlanSections, contents: ReadonlyMap<string, WeekContent>): WeekTargets {
  const winnerIds = [...new Set([...draft.winners.rivals, ...draft.winners.own].filter((winner) => winner.analyzed && hasCorpus(contents, winner.contentItemId)).map((winner) => winner.contentItemId))];
  const focus = draft.focus.directions.flatMap((direction, index) => {
    const evidenceIds = direction.evidenceContentIds.filter((id) => hasCorpus(contents, id));
    return evidenceIds.length > 0 ? [{ ref: `F${index + 1}`, index, evidenceIds }] : [];
  });
  return { winnerIds, focus, avoid: draft.avoid.entries.map((_, index) => ({ ref: `A${index + 1}`, index })) };
}

export const isEmptyTargets = (targets: WeekTargets): boolean => targets.winnerIds.length === 0 && targets.focus.length === 0 && targets.avoid.length === 0;

// --------------------------------------------------------------------- Denetim

/** Çarpan ("3x", "4,2×", "3 kat", "x3") ya da yüzde ("%60", "60%"): modelin yazdığı sayı iddiası. */
const NUMERIC_CLAIM = /\d+(?:[.,]\d+)?\s*(?:x|×|kat\b)|\bx\s*\d|%\s*\d|\d\s*%/iu;
export const hasNumericClaim = (text: string): boolean => NUMERIC_CLAIM.test(text);

export interface SynthesisAnalysis {
  /** Yapısal sorunlar (id/ref kümeleri uyuşmuyor): sonuç kabul edilemez. */
  hard: string[];
  /** Metin başına sorunlar: o metin atılır. */
  soft: string[];
  winners: Map<string, { why: string; quote: string }>;
  focus: Map<string, { rationale: string; quote: string; quoteFrom: string }>;
  avoid: Map<string, string>;
  summary?: string;
}

const quoteLength = (text: string): number => Array.from(text.trim()).length;

export function analyzeSynthesis(output: SynthesisOutput, targets: WeekTargets, contents: ReadonlyMap<string, WeekContent>): SynthesisAnalysis {
  const analysis: SynthesisAnalysis = { hard: [], soft: [], winners: new Map(), focus: new Map(), avoid: new Map() };
  const hard = [
    idSetProblem(targets.winnerIds, output.winners.map((entry) => entry.id), "winner id"),
    idSetProblem(targets.focus.map((target) => target.ref), output.focus.map((entry) => entry.ref), "focus ref"),
    idSetProblem(targets.avoid.map((target) => target.ref), output.avoid.map((entry) => entry.ref), "avoid ref"),
  ];
  analysis.hard = hard.filter((problem): problem is string => problem !== undefined);

  /** Alıntı denetimi: uzunluk + korpusta birebir. Sorun varsa Türkçe sebep. */
  const quoteProblem = (contentId: string, quote: string): string | undefined => {
    if (quoteLength(quote) > RIVAL_QUOTE_MAX) return `alıntı ${RIVAL_QUOTE_MAX} karakterden uzun`;
    const check = checkQuote(contents.get(contentId), quote);
    return check.ok ? undefined : check.reason;
  };

  const wantedWinners = new Set(targets.winnerIds);
  for (const entry of output.winners) {
    if (!wantedWinners.has(entry.id) || analysis.winners.has(entry.id)) continue;
    const problem = hasNumericClaim(entry.why) ? "metinde çarpan/yüzde var" : quoteProblem(entry.id, entry.quote);
    if (problem) analysis.soft.push(`winner ${entry.id}: ${problem}.`);
    else analysis.winners.set(entry.id, { why: entry.why.trim(), quote: entry.quote.trim() });
  }

  const focusTargets = new Map(targets.focus.map((target) => [target.ref, target]));
  for (const entry of output.focus) {
    const target = focusTargets.get(entry.ref);
    if (!target || analysis.focus.has(entry.ref)) continue;
    const problem = hasNumericClaim(entry.rationale)
      ? "metinde çarpan/yüzde var"
      : !target.evidenceIds.includes(entry.quoteFrom)
        ? `alıntı bu yönün kanıt içeriklerinden (${target.evidenceIds.join(", ")}) gelmeli`
        : quoteProblem(entry.quoteFrom, entry.quote);
    if (problem) analysis.soft.push(`focus ${entry.ref}: ${problem}.`);
    else analysis.focus.set(entry.ref, { rationale: entry.rationale.trim(), quote: entry.quote.trim(), quoteFrom: entry.quoteFrom });
  }

  const avoidRefs = new Set(targets.avoid.map((target) => target.ref));
  for (const entry of output.avoid) {
    if (!avoidRefs.has(entry.ref) || analysis.avoid.has(entry.ref)) continue;
    if (hasNumericClaim(entry.reason)) analysis.soft.push(`avoid ${entry.ref}: metinde çarpan/yüzde var.`);
    else analysis.avoid.set(entry.ref, entry.reason.trim());
  }

  if (hasNumericClaim(output.summary)) analysis.soft.push("summary: metinde çarpan/yüzde var.");
  else analysis.summary = output.summary.trim();
  return analysis;
}

/** Düzeltme turuna verilecek sorun metni (yoksa undefined). */
export function synthesisProblem(analysis: SynthesisAnalysis): string | undefined {
  const lines = [...analysis.hard, ...analysis.soft];
  if (lines.length === 0) return undefined;
  return [
    ...lines,
    "Her id/ref için tam bir giriş yaz; alıntıları yalnız o içeriğin kendi metninden BİREBİR kopyala; metinlere sayı, çarpan (3x, 4 kat) ya da yüzde yazma.",
  ].join("\n");
}

// ------------------------------------------------------------------ Birleştirme

/** Metin alanları dışındaki her şey (sayı, id, sıra, güven …) taslakla BİREBİR aynı mı. */
function withoutTexts(sections: WeeklyPlanSections): unknown {
  const copy = structuredClone(sections);
  for (const winner of [...copy.winners.rivals, ...copy.winners.own]) {
    delete winner.why;
    delete winner.quote;
  }
  for (const direction of copy.focus.directions) {
    delete direction.rationale;
    delete direction.rationaleQuote;
  }
  for (const entry of copy.avoid.entries) entry.reason = "";
  return copy;
}

export function assertDraftIntact(draft: WeeklyPlanSections, merged: WeeklyPlanSections): void {
  if (!isDeepStrictEqual(withoutTexts(draft), withoutTexts(merged))) {
    throw new LlmError("invalid_output", "Plan taslağındaki sayı/kimlik alanları değişmiş: metin dışındaki her alan taslakla birebir aynı kalmalı.");
  }
}

/**
 * Taslağın kopyasına yalnız denetimden geçen metinleri yazar; sonuç `WEEKLY_PLAN_SECTIONS_SCHEMA`'dan geçer. Yönün alıntısı
 * gerekçe METNİNE gömülmez: `rationale` yalnız metindir, doğrulanmış alıntı yapısal alan `rationaleQuote`'a (kalıcı kısa rakip
 * alıntısı, `RivalQuote`) yazılır; ekran ikisini ayrı gösterir.
 */
export function mergeSynthesis(draft: WeeklyPlanSections, analysis: SynthesisAnalysis, contents: ReadonlyMap<string, WeekContent>): WeeklyPlanSections {
  const merged = structuredClone(draft);
  for (const winner of [...merged.winners.rivals, ...merged.winners.own]) {
    const text = analysis.winners.get(winner.contentItemId);
    if (!text) continue;
    winner.why = text.why;
    winner.quote = { contentItemId: winner.contentItemId, ownerHandle: winner.ownerHandle, text: text.quote };
  }
  merged.focus.directions.forEach((direction, index) => {
    const text = analysis.focus.get(`F${index + 1}`);
    if (!text) return;
    direction.rationale = text.rationale;
    direction.rationaleQuote = { contentItemId: text.quoteFrom, ownerHandle: contents.get(text.quoteFrom)?.ownerHandle, text: text.quote };
  });
  merged.avoid.entries.forEach((entry, index) => {
    const reason = analysis.avoid.get(`A${index + 1}`);
    if (reason) entry.reason = reason;
  });
  assertDraftIntact(draft, merged);
  return WEEKLY_PLAN_SECTIONS_SCHEMA.parse(merged);
}
