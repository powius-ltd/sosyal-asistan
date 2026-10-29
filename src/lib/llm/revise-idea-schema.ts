/**
 * `revise-idea` çıktı şeması (modelin yeniden yazdığı içerik). Biçim sınırları şemada (modele `--json-schema` ile zorlanır); anlamsal
 * denetim `revise-idea-validate.ts`'te. Dil: `summary` HEP Türkçe (panelde kullanıcı okur); hook / senaryo çalışma alanının içerik dilinde.
 */
import "server-only";

import { z } from "zod";

import type { ContentLanguage } from "@/lib/domain/content-language";
import { CONTENT_LANGUAGE_NAME } from "@/lib/llm/prompt-blocks";
import { hookTypeSchema } from "@/lib/llm/taxonomy";

export const REVISE_HOOKS_MIN = 3;
export const REVISE_HOOKS_MAX = 5;

export const reviseOutputSchema = (language: ContentLanguage) => {
  const name = CONTENT_LANGUAGE_NAME[language];
  return z.object({
    hooks: z
      .array(z.object({ text: z.string().min(1).max(200).describe(`${name} opening line, speakable in 3 seconds`), type: hookTypeSchema }))
      .min(REVISE_HOOKS_MIN)
      .max(REVISE_HOOKS_MAX),
    outline: z.array(z.string().min(1).max(200)).min(2).max(8).describe("3-6 short Turkish scene/step descriptions"),
    script: z.string().min(20).max(3500).optional().describe(`Full spoken script in ${name}; include it only when the request changes what is said`),
    summary: z.string().min(1).max(200).describe("One Turkish sentence saying what you changed, in plain words"),
  });
};

export type RawRevision = z.infer<ReturnType<typeof reviseOutputSchema>>;
