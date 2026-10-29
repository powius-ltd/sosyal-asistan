/**
 * Görev — fikir düzeltme (`revise-idea`, SPN-35): kullanıcı sohbette "şu fikrin açılışını daha sert yap" gibi bir istek yazar; model YALNIZ
 * hook'ları, taslağı ve (gerekirse) senaryoyu yeniden yazar. Başlık, gerekçe, kanıt ve alıntı değişmez, modele de verilmez.
 * Kullanıcı isteği ve fikir metni VERİDİR (talimat değil). Sonuç sunucuda denetlenir (`revise-idea-validate.ts`); geçmezse
 * 1 düzeltme turu, yine geçmezse `ok: false` + sebep döner (HİÇBİR ŞEY YAZILMAZ; sessiz kabul yok). Abonelik çağrısı: tutar yok (görev `llm_chat`).
 */
import "server-only";

import type { ContentLanguage } from "@/lib/domain/content-language";
import { clipForPrompt, creatorLanguageRule, dataBlock, JSON_ONLY_RULE, PANEL_LANGUAGE_RULE, PLAIN_LANGUAGE_RULE, UNTRUSTED_DATA_RULE } from "@/lib/llm/prompt-blocks";
import { reviseOutputSchema, type RawRevision } from "@/lib/llm/revise-idea-schema";
import { validateRevision, type ReviseValidationContext } from "@/lib/llm/revise-idea-validate";
import type { RivalText } from "@/lib/llm/script-rules";
import type { LlmBackend, LlmCallMeta } from "@/lib/llm/types";

export const REVISE_PROMPT_VERSION = "revise-idea-v1";
const DEFAULT_TIMEOUT_MS = 90_000;

export interface ReviseIdeaInput {
  idea: {
    title: string;
    rationale: string;
    hooks: readonly string[];
    scriptOutline: readonly string[];
    script?: string;
  };
  /** Kullanıcının isteği (kendi sözleriyle). */
  request: string;
  /** Niş özeti (varsa). */
  niche?: string;
  language: ContentLanguage;
  /** Kopya denetimi için fikrin rakip metinleri. */
  rivals: readonly RivalText[];
}

export type ReviseIdeaOutcome =
  | { ok: true; value: RawRevision; promptVersion: string; meta: LlmCallMeta }
  | { ok: false; reason: string; promptVersion: string; meta: LlmCallMeta };

const systemPrompt = (language: ContentLanguage): string =>
  [
    "You revise ONE short-video idea for a creator. <request> is what the creator asked to change; <idea> is the current idea. Rewrite only what the request asks for: the opening lines (hooks), the scene outline and, when the request changes what is spoken, the full script.",
    "Keep everything the request does not touch: same topic, same point, the creator's voice. Do not change the title or the reason; they are not part of your output.",
    "Return 3 to 5 hooks, all different from each other, each with its hook type. Return the outline as short Turkish scene steps. Include script only when the spoken text changes. Always return summary: one plain Turkish sentence saying what you changed.",
    "Write in your own words: never reuse a run of 8 or more words from any competitor text. Do not invent facts about the creator's life, places or results that are not already in <idea>.",
    creatorLanguageRule(language),
    PANEL_LANGUAGE_RULE,
    PLAIN_LANGUAGE_RULE,
    UNTRUSTED_DATA_RULE,
    JSON_ONLY_RULE,
  ].join("\n");

const payloadOf = (input: ReviseIdeaInput): string =>
  [
    dataBlock("request", clipForPrompt(input.request, 500) ?? ""),
    dataBlock("idea", {
      title: input.idea.title,
      rationale: clipForPrompt(input.idea.rationale, 500),
      hooks: input.idea.hooks,
      outline: input.idea.scriptOutline,
      script: clipForPrompt(input.idea.script, 3500),
    }),
    ...(input.niche === undefined ? [] : [dataBlock("niche", clipForPrompt(input.niche, 400) ?? "")]),
  ].join("\n\n");

export async function reviseIdea(backend: LlmBackend, input: ReviseIdeaInput, options: { timeoutMs?: number; model?: string } = {}): Promise<ReviseIdeaOutcome> {
  const ctx: ReviseValidationContext = {
    language: input.language,
    current: { hooks: input.idea.hooks, scriptOutline: input.idea.scriptOutline, script: input.idea.script },
    rivals: input.rivals,
  };
  const { value, meta } = await backend.runJson({
    task: "llm_chat",
    system: systemPrompt(input.language),
    input: payloadOf(input),
    schema: reviseOutputSchema(input.language),
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    model: options.model,
    review: (output) => {
      const verdict = validateRevision(output, ctx);
      return verdict.ok ? undefined : verdict.reason;
    },
    reviewFailure: "accept",
  });
  const verdict = validateRevision(value, ctx);
  return verdict.ok ? { ok: true, value, promptVersion: REVISE_PROMPT_VERSION, meta } : { ok: false, reason: verdict.reason, promptVersion: REVISE_PROMPT_VERSION, meta };
}
