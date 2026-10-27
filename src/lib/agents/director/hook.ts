/**
 * İşçi kancası: `AGENT_AUTO=on` iken iş bitince halka zinciri yerine AJAN turu çalışır; kapalıyken `withCycleChain` AYNEN döner (işçi bugünkü
 * gibi, `CYCLE_AUTO` kuralları geçerli). Açıkken önce bitiş bildirimi (`base`), sonra tur. Kancanın hatası işi düşürmez (iş kapanmıştır):
 * günlüğe uyarı. Kuru koşular turu tetiklemez. Tur biten işin kuyruğuna yazar.
 */
import "server-only";

import { isAgentAuto } from "@/lib/agents/director/enabled";
import { runDirectorTurn, type DirectorTurnParams, type DirectorTurnResult } from "@/lib/agents/director/turn";
import { withCycleChain, type CycleHookOptions } from "@/lib/cycle/hook";
import type { JobFinishedHook } from "@/lib/job-runner/finish-notice";

export interface DirectorHookOptions extends CycleHookOptions {
  /** Testler için: `runDirectorTurn` yerine. */
  turn?: (params: DirectorTurnParams) => Promise<DirectorTurnResult>;
}

export function withDirector(base: JobFinishedHook | undefined, options: DirectorHookOptions): JobFinishedHook | undefined {
  if (!isAgentAuto(options.env)) return withCycleChain(base, options);
  const turn = options.turn ?? runDirectorTurn;
  const log = options.log ?? (() => undefined);
  return async (job, final) => {
    await base?.(job, final);
    if (job.dryRun) return;
    try {
      await turn({ client: options.client, workspaceId: job.workspaceId, queue: job.queue, now: (options.clock ?? (() => new Date()))(), env: options.env, trigger: "job_finished", log });
    } catch (error) {
      log(`Uyarı: ajan turu çalışmadı (${error instanceof Error ? error.message : "bilinmeyen hata"}); iş kapandı, bir sonraki tetikte sürer.`);
    }
  };
}
