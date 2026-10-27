/**
 * Senaryo editörü + olgu kontrolü (görev 6): plana GİREN her fikrin senaryosu için TEK ikinci LLM turu (Claude CLI, abonelik, araçsız).
 * (1) Senaryoyu konuşma diline göre düzeltir (`craft-blocks.ts`), (2) olgu iddialarını (tarih, sayı, ad, bilimsel / tarihî ifade) modelin kendi
 * bilgisiyle `ok | uncertain | wrong` işaretler; web erişimi YOKTUR. `wrong` senaryoda düzeltilir, `uncertain` "yayından önce doğrula" listesine girer.
 * Çıktı kod denetiminden geçer (`script-review-validate.ts`); geçmezse `review` yok ve çağıran özgün senaryoyu korur. FİKİR BAŞINA TEK TUR:
 * düzeltme turu YOKTUR (`maxAttempts: 1`; denetim ya da şema düşerse ikinci model çağrısı yapılmaz, süre / abonelik boşa gitmez). LLM hatası (`LlmError`) çağırana fırlar. Koşu türü: `llm_week_synthesis` + "senaryo editörü" etiketi (`RunKind` genişletmesi ayrı iş).
 */
import "server-only";

import type { ContentLanguage } from "@/lib/domain/content-language";
import type { ScriptReview } from "@/lib/domain/intel";
import { craftBlocks, CRAFT_BLOCKS_VERSION } from "@/lib/llm/craft-blocks";
import { clipForPrompt, creatorLanguageRule, dataBlock, JSON_ONLY_RULE, PANEL_LANGUAGE_RULE, UNTRUSTED_DATA_RULE } from "@/lib/llm/prompt-blocks";
import { CLAIMS_MAX, scriptReviewSchema } from "@/lib/llm/script-review-schema";
import { finalizeReview, reviewProblems, WORD_COUNT_TOLERANCE, type ScriptReviewContext } from "@/lib/llm/script-review-validate";
import { COPY_WORD_LIMIT, type RivalText } from "@/lib/llm/script-rules";
import type { LlmBackend, LlmCallMeta } from "@/lib/llm/types";

export const SCRIPT_REVIEW_PROMPT_VERSION = `script-review-v2+${CRAFT_BLOCKS_VERSION}`;
/** Tek editör çağrısının en çok süresi (çağıran toplam bütçeden kalanla kısabilir). */
export const SCRIPT_REVIEW_TIMEOUT_MS = 240_000;

export interface ScriptReviewInput {
  title: string;
  script: string;
  language: ContentLanguage;
  targetDurationSec?: number;
  /** Kanıt (rakip) alıntıları: YALNIZ bağlam (istemde `context`); senaryoya kopyalanmaz, korunması istenmez. */
  evidenceQuotes: readonly string[];
  /** Hesap sahibinin kendi videosundan kişisel olgu alıntıları: değişmez, yenisi eklenmez. */
  personalQuotes: readonly string[];
  /** Havuzdaki rakip metinleri (kopya denetimi: revize metin bunlarla ≥ 8 ardışık kelime paylaşamaz). */
  rivalTexts?: readonly RivalText[];
}

export interface ScriptReviewOutcome {
  /** Denetimden geçen sonuç; geçmediyse undefined (çağıran özgün senaryoyu korur). */
  review?: ScriptReview;
  /** Yayına giden senaryo: revize metin (denetim geçtiyse) ya da özgün. */
  script: string;
  /** Son denemede de kalan sorunlar (review yoksa sebep). */
  problems: string[];
  promptVersion: string;
  meta: LlmCallMeta;
}

function systemPrompt(language: ContentLanguage): string {
  return [
    "You are the final script editor and fact checker of a short-form-video account. You get ONE finished script (<script>) that will be read out loud to a camera. You do two jobs:",
    "1. EDIT it for spoken delivery, lightly: keep the creator's voice, the hook, the structure, the meaning and the length. Fix only what sounds stiff, translated, machine-written or off-pace according to the craft rules below. If a passage needs a real rewrite, leave it and do not invent new content.",
    `2. CHECK THE FACTS. List the factual claims in the script (dates, years, numbers, names of people, places and works, historical, scientific or technical statements; at most ${CLAIMS_MAX}), each copied VERBATIM from the script in claims[].text. You have NO web access: judge from your own knowledge only. verdict=ok only when you are confident it is correct; verdict=uncertain when you cannot be sure (do not guess); verdict=wrong when it is incorrect. For every wrong claim, rewrite that sentence in revisedScript so it states the correct fact (or drop the false detail), and say in note what is correct.`,
    "",
    `Hard limits: revisedScript keeps the word count within ${WORD_COUNT_TOLERANCE * 100}% of the original. Never add facts, numbers, years or personal details that are not in the original, except the correct fact for a claim you marked wrong. Passages listed in <protected> (the creator's own personal facts) keep their exact meaning and, when they appear word for word in the script, stay word for word. Never add anything about the creator's own life: no new personal stories, past events, first-person experiences or new names of people, places or works (the one exception is the correct name for a claim you marked wrong).`,
    `<context> lists short quotes from rival videos that inspired the idea. They are background ONLY: never copy, closely paraphrase or add their wording to the script. The script must never share ${COPY_WORD_LIMIT} or more consecutive words with any rival text; an edit that does is thrown away and the original script is kept.`,
    "changes lists, in short Turkish lines, the spoken-language edits you made (empty when none). When nothing needs fixing, return the script unchanged, changes empty.",
    "",
    ...craftBlocks(language),
    creatorLanguageRule(language),
    `${PANEL_LANGUAGE_RULE} (This means changes and claims[].note.)`,
    UNTRUSTED_DATA_RULE,
    JSON_ONLY_RULE,
  ].join("\n");
}

function buildPayload(input: ScriptReviewInput): string {
  return [
    dataBlock("idea", { title: clipForPrompt(input.title, 160), language: input.language, ...(input.targetDurationSec === undefined ? {} : { targetDurationSec: input.targetDurationSec }) }),
    dataBlock("script", input.script),
    dataBlock("protected", { personalFacts: input.personalQuotes.map((q) => clipForPrompt(q, 240)) }),
    dataBlock("context", { rivalQuotesDoNotCopy: input.evidenceQuotes.map((q) => clipForPrompt(q, 240)) }),
  ].join("\n\n");
}

export interface ScriptReviewOptions {
  timeoutMs?: number;
  model?: string;
}

export async function reviewScript(backend: LlmBackend, input: ScriptReviewInput, options: ScriptReviewOptions = {}): Promise<ScriptReviewOutcome> {
  const ctx: ScriptReviewContext = { script: input.script, quotes: input.personalQuotes, language: input.language, rivalTexts: input.rivalTexts ?? [] };
  const { value, meta } = await backend.runJson({
    task: "llm_week_synthesis", // ayrı tür `domain/run.ts`'e dokunmayı gerektirir (RAPOR "Bekleyen"); etiket ayırt eder
    system: systemPrompt(input.language),
    input: buildPayload(input),
    schema: scriptReviewSchema(input.language),
    timeoutMs: options.timeoutMs ?? SCRIPT_REVIEW_TIMEOUT_MS,
    model: options.model,
    review: (output) => {
      const problems = reviewProblems(output, ctx);
      return problems.length === 0 ? undefined : `Senaryo kod denetiminden geçmedi; tüm çıktıyı yeniden yaz:\n${problems.map((problem) => `- ${problem}`).join("\n")}`;
    },
    reviewFailure: "accept",
    maxAttempts: 1, // SPEC: fikir başına tek tur; Claude CLI'nin genel düzeltme turu bu çağrıda kapalı
  });
  const problems = reviewProblems(value, ctx);
  if (problems.length > 0) return { script: input.script, problems, promptVersion: SCRIPT_REVIEW_PROMPT_VERSION, meta };
  const review = finalizeReview(value, input.script, SCRIPT_REVIEW_PROMPT_VERSION);
  return { review, script: review.revised ? value.revisedScript.trim() : input.script, problems: [], promptVersion: SCRIPT_REVIEW_PROMPT_VERSION, meta };
}
