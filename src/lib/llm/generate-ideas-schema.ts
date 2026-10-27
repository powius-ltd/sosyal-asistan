/**
 * `generate-ideas` çıktı şeması (modelin döndürdüğü ham fikir). Sayım sınırları (3–5 hook, ≥ 2 kanıt) şemada da yazılıdır ki model
 * `--json-schema` ile bunlara zorlansın; KOD DOĞRULAMASI yine `generate-ideas-validate.ts`'te yapılır (şema yalnız biçim).
 * Kişisel anlatım: `usesPersonalStory` + `personalQuotes` (kendi videolarından birebir dayanak; kod doğrular).
 * Dil: `title`, `rationale`, `topic`, `outline` HEP Türkçe (panelde kullanıcı okur); `hooks`, `script`, `captionDraft` çalışma alanının
 * içerik dilinde (`ideasOutputSchema(language)`: yalnız `describe` metinleri dile göre değişir, biçim aynıdır).
 */
import "server-only";

import { z } from "zod";

import type { ContentLanguage } from "@/lib/domain/content-language";
import { RIVAL_QUOTE_MAX } from "@/lib/domain/intel";
import { CONTENT_LANGUAGE_NAME } from "@/lib/llm/prompt-blocks";
import { ctaTypeSchema, frameSchema, hookTypeSchema } from "@/lib/llm/taxonomy";

export const HOOKS_MIN = 3;
export const HOOKS_MAX = 5;
export const EVIDENCE_MIN = 2;
export const EVIDENCE_MAX = 6;
export const IDEAS_MAX = 12;

const rawIdeaSchema = (language: ContentLanguage) => {
  const name = CONTENT_LANGUAGE_NAME[language];
  return z.object({
    title: z.string().min(1).max(120).describe("Short Turkish card title"),
    rationale: z.string().min(1).max(500).describe("1-2 Turkish sentences: why this idea, which direction and evidence support it; no numbers"),
    topic: z.string().min(1).max(80).describe("Short Turkish topic label"),
    frame: frameSchema,
    ctaType: ctaTypeSchema,
    targetDurationSec: z.number().int().min(5).max(180),
    hooks: z
      .array(z.object({ text: z.string().min(1).max(200).describe(`${name} opening line, speakable in 3 seconds`), type: hookTypeSchema }))
      .min(HOOKS_MIN)
      .max(HOOKS_MAX),
    script: z.string().min(20).max(3500).describe(`Full spoken script in ${name}, in the creator's voice`),
    outline: z.array(z.string().min(1).max(200)).min(2).max(8).describe("3-6 short Turkish scene/step descriptions"),
    captionDraft: z.string().min(1).max(2200).describe(`${name} caption in the creator's voice`),
    evidenceIds: z.array(z.string()).min(EVIDENCE_MIN).max(EVIDENCE_MAX).describe("Ids from <evidence>"),
    quotes: z
      .array(z.object({ contentId: z.string(), text: z.string().min(1).max(RIVAL_QUOTE_MAX).describe("Verbatim passage from that competitor video") }))
      .min(1)
      .max(4),
    usesPersonalStory: z
      .boolean()
      .optional()
      .describe("true when the script tells a personal story or states facts about the creator's own life (place, event, history); omit or false otherwise"),
    personalQuotes: z
      .array(z.object({ contentId: z.string(), text: z.string().min(1).max(RIVAL_QUOTE_MAX).describe("Verbatim passage from the creator's OWN video") }))
      .max(3)
      .optional()
      .describe("Required when usesPersonalStory is true: verbatim passages from the creator's own videos (isOwn=true, listed in evidenceIds) that contain those facts"),
    voiceTraitKeys: z.array(z.string()).max(8),
    directionRef: z.string().optional().describe("Ref of the direction this idea serves, e.g. F1"),
    slotId: z.string().optional().describe("Required only when <brief> is given: the slotId (S1, S2 ...) of the brief slot this idea fills"),
    purpose: z.enum(["reach", "sales"]).optional().describe("Which goal the idea serves: reach (views, saves/shares, followers) or sales (trust to customer to sale). Required only when <account> says goals are mixed"),
  });
};

/** Modelin döndürdüğü fikir listesi şeması; açıklamalar içerik diline göre. */
export const ideasOutputSchema = (language: ContentLanguage) => z.object({ ideas: z.array(rawIdeaSchema(language)).min(1).max(IDEAS_MAX) });

export type RawIdeasOutput = z.infer<ReturnType<typeof ideasOutputSchema>>;
export type RawIdea = RawIdeasOutput["ideas"][number];
