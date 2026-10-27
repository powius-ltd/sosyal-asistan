/**
 * Senaryo editörü turunun çıktı şeması (modelin ham çıktısı). Şema yalnız biçimdir; kurallar `script-review-validate.ts`'te kodla
 * denetlenir. `revisedScript` içerik dilinde, `changes` ve `claims[].note` HEP Türkçe (panelde müşteri okur); `claims[].text` özgün
 * senaryodan birebir parçadır.
 */
import "server-only";

import { z } from "zod";

import type { ContentLanguage } from "@/lib/domain/content-language";
import { SCRIPT_CLAIM_VERDICTS } from "@/lib/domain/intel";
import { CONTENT_LANGUAGE_NAME } from "@/lib/llm/prompt-blocks";

export const CLAIMS_MAX = 12;
export const CHANGES_MAX = 8;

export const scriptReviewSchema = (language: ContentLanguage) =>
  z.object({
    revisedScript: z.string().min(20).max(3500).describe(`The full script after your edits, in ${CONTENT_LANGUAGE_NAME[language]}; identical to the input when nothing needs fixing`),
    changes: z.array(z.string().min(1).max(200)).max(CHANGES_MAX).describe("Short Turkish list of the spoken-language edits you made (one line each); empty when you made none"),
    claims: z
      .array(
        z.object({
          text: z.string().min(1).max(240).describe("The factual claim copied VERBATIM from the input script"),
          verdict: z.enum(SCRIPT_CLAIM_VERDICTS).describe("ok = you are confident it is correct; uncertain = you cannot be sure; wrong = it is incorrect"),
          note: z.string().min(1).max(300).describe("One short Turkish sentence: why, or what the correct fact is"),
        }),
      )
      .max(CLAIMS_MAX),
  });

export type RawScriptReview = z.infer<ReturnType<typeof scriptReviewSchema>>;
