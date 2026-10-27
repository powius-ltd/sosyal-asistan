/**
 * Görev 1 — konu eleği (`llm_topic_screen`): her videonun açıklaması ve transcript açılışı niş içinde mi, konusu ne.
 * En çok 10'luk parti (`SCREEN_BATCH_MAX`); daha çoğu için `screenTopicsBatched`. Sayılabilir hiçbir şey LLM'e sorulmaz: yalnız
 * eleme + konu etiketi + kısa Türkçe gerekçe.
 *
 * KOD DOĞRULAMASI: çıktı id'leri girdi id'leriyle BİREBİR aynı olmalı (eksik/fazla/yinelenen yok); değilse sorun modele geri verilip
 * 1 düzeltme turu yapılır, yine olmazsa `invalid_output` (eksik bir videonun sessizce "niş içi" sayılması yok).
 * Metni olmayan (açıklama ve transcript boş) öğe modele gönderilmez: `unscreenable` döner (karar verilemez ≠ niş dışı).
 * ÜÇ SONUÇ: `in_niche` | `off_niche` | `unsure`. Model karar veremezse (metin çok ince/belirsiz) `unsure` der; bu "niş dışı" DEĞİLDİR: satır
 * yazılmaz (`unsure` listesinde döner), çağıran içeriği o koşuda niş içi sayar.
 */
import "server-only";

import { z } from "zod";

import { idSetProblem } from "@/lib/llm/content-text";
import { clipForPrompt, dataBlock, JSON_ONLY_RULE, PANEL_LANGUAGE_RULE, UNTRUSTED_DATA_RULE } from "@/lib/llm/prompt-blocks";
import { LlmError, type LlmBackend, type LlmCallMeta } from "@/lib/llm/types";

export const PROMPT_VERSION = "screen-topics-v3";
export const SCREEN_BATCH_MAX = 10;
const CAPTION_CHARS = 500;
const OPENING_CHARS = 400;
const DEFAULT_TIMEOUT_MS = 120_000;

export interface ScreenTopicsItem {
  id: string;
  caption?: string;
  /** Transcript'in ilk satırları/cümleleri (varsa). */
  transcriptOpening?: string;
}

export interface ScreenTopicsInput {
  /** Niş özeti (1–3 cümle): neyin "niş içi" sayılacağı. */
  niche: string;
  items: readonly ScreenTopicsItem[];
}

/** Karar verilen sonuç (`unsure` burada YOK: ayrı listede döner, satır yazılmaz). */
export interface TopicScreenResult {
  id: string;
  inNiche: boolean;
  /** Kısa Türkçe konu etiketi (2–5 kelime). */
  topic: string;
  /** Türkçe tek cümle gerekçe. */
  reason: string;
}

export interface ScreenTopicsOutcome {
  /** Girdi sırasında; `unscreenable` ve `unsure` olanlar yok. */
  results: TopicScreenResult[];
  /** Açıklaması da transcript'i de olmayan öğeler (model çağrılmadı). */
  unscreenable: string[];
  /** Modelin karar veremediği öğeler (niş dışı DEĞİL; satır yazılmaz, çağıran niş içi sayar). */
  unsure: string[];
  promptVersion: string;
  /** Model çağrısı yapılmadıysa (hepsi `unscreenable`) undefined. */
  meta?: LlmCallMeta;
}

export const SCREEN_OUTPUT_SCHEMA = z.object({
  results: z.array(
    z.object({
      id: z.string().describe("The item's id, copied exactly"),
      verdict: z.enum(["in_niche", "off_niche", "unsure"]).describe("in_niche, off_niche (only when clearly unrelated) or unsure (cannot decide from the text given)"),
      topic: z.string().min(1).max(80).describe("Short Turkish topic label, 2-5 words"),
      reason: z.string().min(1).max(300).describe("One Turkish sentence naming the concrete words that decided it"),
    }),
  ),
});

const SYSTEM_PROMPT = [
  "You screen short-form videos for a competitor-research panel. The niche of interest is in <niche>. For each item in <items>, decide from its caption and opening transcript lines only whether the video is on-niche.",
  "",
  "The accounts being screened were picked by the user as competitors in this SAME niche, so the default is verdict = in_niche. Mark off_niche only when the video's subject is clearly unrelated to the niche, for example a beauty or health hack, a product promotion, unrelated entertainment, or plain lifestyle with no link to the niche.",
  "These are NOT reasons for off-niche: the audience the video addresses (for example it does not speak to women entrepreneurs explicitly), a different format or style than the niche description, a different religion or denomination, or a wording you would not use yourself.",
  "When <niche> is about spirituality, faith, mindset or coaching, these subjects are in-niche: spirituality, faith and prayer, mind renewal and mindset, visualization and manifestation, yoga and breathwork, personal transformation, women and work life.",
  "",
  "Return one result per item:",
  "- id: copy the item's id exactly.",
  "- verdict: in_niche unless the subject is clearly unrelated (see above); off_niche only for a clearly unrelated subject; unsure when the text given (for example only hashtags or emojis, or a few ambiguous words) is too thin or ambiguous to decide either way. Thin text is NEVER a reason for off_niche: judge from what is there, and answer unsure only when there is nothing to judge from.",
  "- topic: a short label (2-5 words) for what the video is about, even when it is off-niche or unsure.",
  "- reason: one sentence pointing at the concrete words that decided it; when verdict is off_niche, name the clearly unrelated subject; when unsure, say what is missing.",
  "",
  "Exactly one result per input item: no missing ids, no extra ids, no duplicates. Judge only the text given; do not guess from the id or handle.",
  PANEL_LANGUAGE_RULE,
  UNTRUSTED_DATA_RULE,
  JSON_ONLY_RULE,
].join("\n");

const hasText = (item: ScreenTopicsItem) => [item.caption, item.transcriptOpening].some((text) => text !== undefined && text.trim() !== "");

export interface ScreenTopicsOptions {
  timeoutMs?: number;
  model?: string;
}

/** Tek parti (≤ 10 öğe). */
export async function screenTopics(backend: LlmBackend, input: ScreenTopicsInput, options: ScreenTopicsOptions = {}): Promise<ScreenTopicsOutcome> {
  const niche = input.niche.trim();
  if (niche === "") throw new LlmError("invalid_input", "Niş özeti boş.");
  if (input.items.length === 0) throw new LlmError("invalid_input", "Elenecek içerik yok.");
  if (input.items.length > SCREEN_BATCH_MAX) throw new LlmError("invalid_input", `Bir partide en çok ${SCREEN_BATCH_MAX} içerik elenir (${input.items.length} verildi).`);
  const ids = input.items.map((item) => item.id);
  if (ids.some((id) => id.trim() === "") || new Set(ids).size !== ids.length) throw new LlmError("invalid_input", "İçerik id'leri boş olmamalı ve tekil olmalı.");

  const sendable = input.items.filter(hasText);
  const unscreenable = input.items.filter((item) => !hasText(item)).map((item) => item.id);
  if (sendable.length === 0) return { results: [], unscreenable, unsure: [], promptVersion: PROMPT_VERSION };

  const payload = sendable.map((item) => ({
    id: item.id,
    caption: clipForPrompt(item.caption, CAPTION_CHARS),
    transcriptOpening: clipForPrompt(item.transcriptOpening, OPENING_CHARS),
  }));
  const expectedIds = sendable.map((item) => item.id);

  const { value, meta } = await backend.runJson({
    task: "llm_topic_screen",
    system: SYSTEM_PROMPT,
    input: [dataBlock("niche", niche), dataBlock("items", payload)].join("\n\n"),
    schema: SCREEN_OUTPUT_SCHEMA,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    model: options.model,
    review: (output) => idSetProblem(expectedIds, output.results.map((result) => result.id)),
  });

  const byId = new Map(value.results.map((result) => [result.id, result]));
  const found = expectedIds.map((id) => byId.get(id) as (typeof value.results)[number]);
  const unsure = found.filter((entry) => entry.verdict === "unsure").map((entry) => entry.id);
  const results = found
    .filter((entry) => entry.verdict !== "unsure")
    .map((entry) => ({ id: entry.id, inNiche: entry.verdict === "in_niche", topic: entry.topic.trim(), reason: entry.reason.trim() }));
  return { results, unscreenable, unsure, promptVersion: PROMPT_VERSION, meta };
}

export interface ScreenTopicsBatchedOutcome {
  results: TopicScreenResult[];
  unscreenable: string[];
  unsure: string[];
  /** Başarısız partiler (elenemeyen id'ler + hata): sonraki koşuda yeniden denenir; diğer partilerin sonucu korunur. */
  failed: { ids: string[]; error: LlmError }[];
  /** Başarılı parti başına bir meta (her biri ayrı `collection_runs` satırı). */
  metas: LlmCallMeta[];
  promptVersion: string;
}

/** Bir kez olunca sonraki partilerde de olacak hatalar (CLI yok/oturum yok/limit dolu): kalan partiler denenmez. */
const PERSISTENT_ERRORS: readonly string[] = ["spawn_failed", "cli_failed"];
/** Çağıranın hatası: partiye çevrilmez, olduğu gibi fırlar. */
const CALLER_ERRORS: readonly string[] = ["invalid_input", "invalid_config", "not_implemented"];

/**
 * Öğeleri 10'luk partilere bölüp SIRAYLA eler. Bir partinin `LlmError`'ı (çıktı geçersiz, zaman aşımı) önceki partilerin sonucunu
 * düşürmez: o partinin id'leri `failed`'a yazılır. Kalıcı hatada (CLI yok/oturum yok) kalan partiler de `failed` olur, model çağrılmaz.
 */
export async function screenTopicsBatched(backend: LlmBackend, input: ScreenTopicsInput, options: ScreenTopicsOptions = {}): Promise<ScreenTopicsBatchedOutcome> {
  const outcome: ScreenTopicsBatchedOutcome = { results: [], unscreenable: [], unsure: [], failed: [], metas: [], promptVersion: PROMPT_VERSION };
  for (let start = 0; start < input.items.length; start += SCREEN_BATCH_MAX) {
    const items = input.items.slice(start, start + SCREEN_BATCH_MAX);
    try {
      const batch = await screenTopics(backend, { niche: input.niche, items }, options);
      outcome.results.push(...batch.results);
      outcome.unscreenable.push(...batch.unscreenable);
      outcome.unsure.push(...batch.unsure);
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
