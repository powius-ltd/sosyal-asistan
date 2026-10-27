/**
 * Aday niş eleği (`llm_topic_screen` türü, abonelik): rakip adayının biyografisi + son ≤ 6 açıklaması ↔ çalışma alanının niş özeti →
 * `fit | off | unsure` + gerekçe + birebir alıntı. En çok 15'lik parti (`SCREEN_CANDIDATE_BATCH_MAX`); daha çoğu `screenCandidatesBatched`.
 * Sayılabilir hiçbir şey LLM'e sorulmaz (boyut, tutan oranı, sıralama `collection/candidate-rank.ts`'te düz kod).
 *
 * KOD DOĞRULAMASI: id kümesi girdiyle birebir aynı (değilse 1 düzeltme turu, sonra `invalid_output`). `fit`/`off` kararı alıntısı biyografi +
 * açıklamalarda BİREBİR bulunmuyorsa (`lib/intel/evidence`) `unsure`'a düşer (gerekçe korunur). Metni olmayan aday (biyografi ve açıklama yok)
 * modele gitmez: `unsure` döner (karar verilemez ≠ niş dışı).
 */
import "server-only";

import { z } from "zod";

import { verifyEvidence } from "@/lib/intel/evidence";
import { idSetProblem } from "@/lib/llm/content-text";
import { clipForPrompt, dataBlock, JSON_ONLY_RULE, PANEL_LANGUAGE_RULE, PLAIN_LANGUAGE_RULE, UNTRUSTED_DATA_RULE, VERBATIM_QUOTE_RULE } from "@/lib/llm/prompt-blocks";
import { LlmError, type LlmBackend, type LlmCallMeta } from "@/lib/llm/types";

export const CANDIDATE_PROMPT_VERSION = "screen-candidates-v1";
export const SCREEN_CANDIDATE_BATCH_MAX = 15;
export const CANDIDATE_CAPTIONS_MAX = 6;
const BIO_CHARS = 400;
const CAPTION_CHARS = 300;
const DEFAULT_TIMEOUT_MS = 150_000;

export interface ScreenCandidateItem {
  id: string;
  bio?: string;
  /** Adayın toplanmış son açıklamaları (en yeni önce; en çok 6 kullanılır). */
  captions?: readonly string[];
}

export type CandidateFit = "fit" | "off" | "unsure";

export interface CandidateScreenResult {
  id: string;
  fit: CandidateFit;
  /** Türkçe tek cümle gerekçe. */
  reason: string;
  /** Doğrulanmış birebir alıntı (yalnız fit/off'ta). */
  quote?: string;
}

export interface ScreenCandidatesOutcome {
  /** Girdi sırasında; her aday için bir sonuç (metni olmayan ve doğrulanamayan `unsure`). */
  results: CandidateScreenResult[];
  /** Model çağrısı yapılmadıysa (hepsi metinsiz) undefined. */
  meta?: LlmCallMeta;
  promptVersion: string;
  /** Alıntısı tutmadığı için `unsure`'a düşürülen aday sayısı. */
  downgraded: number;
}

export const CANDIDATE_OUTPUT_SCHEMA = z.object({
  results: z.array(
    z.object({
      id: z.string().describe("The candidate's id, copied exactly"),
      verdict: z.enum(["fit", "off", "unsure"]).describe("fit: same niche; off: clearly another subject; unsure: the text does not decide"),
      reason: z.string().min(1).max(300).describe("One Turkish sentence naming the concrete words that decided it"),
      quote: z.string().max(300).describe("Verbatim quote from the bio or a caption that backs the verdict; empty string when verdict is unsure"),
    }),
  ),
});

const SYSTEM_PROMPT = [
  "You screen social accounts that are candidate competitors for a creator. The creator's niche is in <niche>. For each candidate in <candidates> decide from its bio and recent captions ONLY whether it posts about the same niche.",
  "",
  "- fit: the bio or captions are clearly about the niche's subject or its audience's problems.",
  "- off: the account is clearly about another subject (for example a shop, a celebrity, general entertainment) with no link to the niche.",
  "- unsure: the text is thin, mixed or ambiguous. Thin text is NEVER a reason for off.",
  "Follower counts, size and popularity are NOT your concern: do not mention them and do not use them.",
  "For fit and off, give a quote copied from the bio or a caption that backs your verdict. For unsure, quote is an empty string.",
  VERBATIM_QUOTE_RULE,
  "reason: one short Turkish sentence a non-marketer can read; point at the concrete words that decided it.",
  "Exactly one result per candidate: no missing ids, no extra ids, no duplicates. Judge only the text given; never guess from the id.",
  PLAIN_LANGUAGE_RULE,
  PANEL_LANGUAGE_RULE,
  UNTRUSTED_DATA_RULE,
  JSON_ONLY_RULE,
].join("\n");

const textsOf = (item: ScreenCandidateItem): string[] =>
  [item.bio, ...(item.captions ?? []).slice(0, CANDIDATE_CAPTIONS_MAX)].filter((text): text is string => text !== undefined && text.trim() !== "");

export interface ScreenCandidatesOptions {
  timeoutMs?: number;
  model?: string;
}

/** Tek parti (≤ 15 aday). */
export async function screenCandidates(backend: LlmBackend, input: { niche: string; items: readonly ScreenCandidateItem[] }, options: ScreenCandidatesOptions = {}): Promise<ScreenCandidatesOutcome> {
  const niche = input.niche.trim();
  if (niche === "") throw new LlmError("invalid_input", "Niş özeti boş.");
  if (input.items.length === 0) throw new LlmError("invalid_input", "Elenecek aday yok.");
  if (input.items.length > SCREEN_CANDIDATE_BATCH_MAX) throw new LlmError("invalid_input", `Bir partide en çok ${SCREEN_CANDIDATE_BATCH_MAX} aday elenir (${input.items.length} verildi).`);
  const ids = input.items.map((item) => item.id);
  if (ids.some((id) => id.trim() === "") || new Set(ids).size !== ids.length) throw new LlmError("invalid_input", "Aday id'leri boş olmamalı ve tekil olmalı.");

  const sendable = input.items.filter((item) => textsOf(item).length > 0);
  const noText: CandidateScreenResult = { id: "", fit: "unsure", reason: "Biyografi ve açıklama yok, karar verilemedi." };
  if (sendable.length === 0) return { results: input.items.map((item) => ({ ...noText, id: item.id })), promptVersion: CANDIDATE_PROMPT_VERSION, downgraded: 0 };

  const payload = sendable.map((item) => ({
    id: item.id,
    bio: clipForPrompt(item.bio, BIO_CHARS),
    captions: (item.captions ?? []).slice(0, CANDIDATE_CAPTIONS_MAX).map((caption) => clipForPrompt(caption, CAPTION_CHARS)),
  }));
  const expectedIds = sendable.map((item) => item.id);
  const { value, meta } = await backend.runJson({
    task: "llm_topic_screen",
    system: SYSTEM_PROMPT,
    input: [dataBlock("niche", niche), dataBlock("candidates", payload)].join("\n\n"),
    schema: CANDIDATE_OUTPUT_SCHEMA,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    model: options.model,
    review: (output) => idSetProblem(expectedIds, output.results.map((result) => result.id)),
  });

  const byId = new Map(value.results.map((result) => [result.id, result]));
  const sendableIds = new Set(expectedIds);
  let downgraded = 0;
  const results = input.items.map((item): CandidateScreenResult => {
    if (!sendableIds.has(item.id)) return { ...noText, id: item.id };
    const raw = byId.get(item.id) as (typeof value.results)[number];
    const reason = raw.reason.trim();
    if (raw.verdict === "unsure") return { id: item.id, fit: "unsure", reason };
    const quote = raw.quote.trim();
    const corpus = { caption: textsOf(item).join("\n") };
    const report = verifyEvidence(corpus, { labels: [{ key: "fit", evidence: quote }] });
    if (quote === "" || report.failures.some((failure) => failure.target === "label")) {
      downgraded += 1;
      return { id: item.id, fit: "unsure", reason: `${reason} (Alıntı metinde bulunamadı, karar doğrulanamadı.)`.slice(0, 300) };
    }
    return { id: item.id, fit: raw.verdict, reason, quote };
  });
  return { results, meta, promptVersion: CANDIDATE_PROMPT_VERSION, downgraded };
}

export interface ScreenCandidatesBatchedOutcome {
  results: CandidateScreenResult[];
  /** Başarısız partiler: sonraki koşuda yeniden denenir; diğer partilerin sonucu korunur. */
  failed: { ids: string[]; error: LlmError }[];
  metas: LlmCallMeta[];
  promptVersion: string;
  downgraded: number;
}

const PERSISTENT_ERRORS: readonly string[] = ["spawn_failed", "cli_failed"];
const CALLER_ERRORS: readonly string[] = ["invalid_input", "invalid_config", "not_implemented"];

/** 15'lik partilere bölüp SIRAYLA eler; bir partinin `LlmError`'ı diğerlerini düşürmez (kalıcı hatada kalanlar denenmez). */
export async function screenCandidatesBatched(backend: LlmBackend, input: { niche: string; items: readonly ScreenCandidateItem[] }, options: ScreenCandidatesOptions = {}): Promise<ScreenCandidatesBatchedOutcome> {
  const outcome: ScreenCandidatesBatchedOutcome = { results: [], failed: [], metas: [], promptVersion: CANDIDATE_PROMPT_VERSION, downgraded: 0 };
  for (let start = 0; start < input.items.length; start += SCREEN_CANDIDATE_BATCH_MAX) {
    const items = input.items.slice(start, start + SCREEN_CANDIDATE_BATCH_MAX);
    try {
      const batch = await screenCandidates(backend, { niche: input.niche, items }, options);
      outcome.results.push(...batch.results);
      outcome.downgraded += batch.downgraded;
      if (batch.meta) outcome.metas.push(batch.meta);
    } catch (error) {
      if (!(error instanceof LlmError) || CALLER_ERRORS.includes(error.code)) throw error;
      const persistent = PERSISTENT_ERRORS.includes(error.code);
      outcome.failed.push({ ids: (persistent ? input.items.slice(start) : items).map((item) => item.id), error });
      if (persistent) break;
    }
  }
  return outcome;
}
