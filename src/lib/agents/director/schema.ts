/**
 * Yönetici ajanın LLM çıktı şeması: ajan yalnız bir EYLEM önerir (kapı `guard.ts` karar verir). Katı: bilinmeyen alan reddedilir; sayı, tutar,
 * tavan, onay alanı YOK (model para konusunda söz sahibi değildir). Mesaj düz Türkçe ve rakamsızdır (uydurma sayı yazılmasın).
 */
import { z } from "zod";

import { DIRECTOR_ACTIONS } from "@/lib/agents/director/guard";
import { JOB_KINDS } from "@/lib/domain/panel-job";

export const DIRECTOR_MESSAGE_MAX = 300;

export const DIRECTOR_OUTPUT_SCHEMA = z.strictObject({
  action: z.enum(DIRECTOR_ACTIONS).describe("open_job = start one job now | ask_approval = the next step needs money the owner has not approved | notify = tell the owner something | wait = do nothing now"),
  kind: z.enum(JOB_KINDS).optional().describe("job kind; only with open_job"),
  week: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Monday of the week; only with kind order"),
  message: z
    .string()
    .trim()
    .max(DIRECTOR_MESSAGE_MAX)
    .refine((text) => !/\d/.test(text), { error: "Mesajda rakam olamaz." })
    .optional()
    .describe("one or two short plain Turkish sentences for the owner; no digits; required for notify and ask_approval"),
});

export type DirectorOutput = z.infer<typeof DIRECTOR_OUTPUT_SCHEMA>;
