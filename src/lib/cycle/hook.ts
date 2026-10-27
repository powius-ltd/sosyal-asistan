/**
 * İşçi kancası: iş bitince AYNI çalışma alanı için halkayı bir adım ilerletir (`advanceCycle`). Anahtar kapalıyken (`CYCLE_AUTO` ≠ on)
 * kanca HİÇ kurulmaz: `withCycleChain` verilen kancayı olduğu gibi döndürür, işçi bugünkü gibi davranır. Kancanın hatası işi düşürmez
 * (iş satırı kapanmıştır): günlüğe uyarı yazılır. Kuru koşular (önizleme) zinciri tetiklemez. İstek biten işin kuyruğuna yazılır.
 */
import "server-only";

import { advanceCycle, type AdvanceParams, type AdvanceResult } from "@/lib/cycle/advance";
import { isCycleAuto } from "@/lib/cycle/enabled";
import type { JobFinishedHook } from "@/lib/job-runner/finish-notice";
import type { AdminClient } from "@/lib/supabase/admin";

export interface CycleHookOptions {
  client: AdminClient;
  env: Readonly<Record<string, string | undefined>>;
  log?: (line: string) => void;
  clock?: () => Date;
  /** Testler için: `advanceCycle` yerine. */
  advance?: (params: AdvanceParams) => Promise<AdvanceResult>;
}

/** Zincir kancası; FIRLATMAZ. */
export function createCycleHook(options: CycleHookOptions): JobFinishedHook {
  const advance = options.advance ?? advanceCycle;
  const log = options.log ?? (() => undefined);
  return async (job) => {
    if (job.dryRun) return;
    try {
      await advance({ client: options.client, workspaceId: job.workspaceId, queue: job.queue, now: (options.clock ?? (() => new Date()))(), env: options.env, log });
    } catch (error) {
      log(`Uyarı: halka ilerletilemedi (${error instanceof Error ? error.message : "bilinmeyen hata"}); iş kapandı, zincir bir sonraki tetikte sürer.`);
    }
  };
}

/** Anahtar kapalıysa `base`'i AYNEN döndürür; açıksa önce `base` (bitiş bildirimi), sonra zincir çalışır. */
export function withCycleChain(base: JobFinishedHook | undefined, options: CycleHookOptions): JobFinishedHook | undefined {
  if (!isCycleAuto(options.env)) return base;
  const chain = createCycleHook(options);
  return async (job, final) => {
    await base?.(job, final);
    await chain(job, final);
  };
}
