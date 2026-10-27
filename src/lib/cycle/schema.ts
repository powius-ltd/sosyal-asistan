/**
 * Halka durumunun JSON sözleşmesi (`npm run halka -- durum --json`): ekran ve yönetici ajan aynı şemayı okur. Yazan (betik) ve okuyan
 * aynı şemayı kullanır; yeni adım / durum = `types.ts` listesi (şema oradan türer).
 */
import { z } from "zod";

import { ACCOUNT_TYPES } from "@/lib/domain/account-type";
import { JOB_KINDS, JOB_STATUSES } from "@/lib/domain/panel-job";
import { CYCLE_STATUSES, CYCLE_STEP_IDS, type CycleState } from "@/lib/cycle/types";

const lastJobSchema = z.strictObject({
  kind: z.enum(JOB_KINDS),
  status: z.enum(JOB_STATUSES),
  finishedAt: z.string().optional(),
});

const stepSchema = z.strictObject({
  id: z.enum(CYCLE_STEP_IDS),
  status: z.enum(CYCLE_STATUSES),
  reason: z.string().min(1),
  jobKind: z.enum(JOB_KINDS).optional(),
  lastJob: lastJobSchema.optional(),
});

export const cycleStateSchema = z.strictObject({
  workspaceId: z.string().min(1),
  asOf: z.string().min(1),
  accountType: z.enum(ACCOUNT_TYPES),
  next: z.enum(CYCLE_STEP_IDS).optional(),
  steps: z.array(stepSchema).length(CYCLE_STEP_IDS.length),
}) satisfies z.ZodType<CycleState>;
