"use client";

import { useCallback, useState } from "react";

import { requestJobAction } from "@/app/actions/jobs";
import { callAction } from "@/components/common/call-action";
import type { JobsSeed } from "@/components/jobs/job-run-types";
import { jobStatusStore, type JobsSnapshot } from "@/components/jobs/job-status-store";
import { useJobsStatus } from "@/components/jobs/use-jobs-status";
import type { RequestJobInput } from "@/lib/data/queries";
import type { JobStatusView } from "@/lib/domain/panel-job-view";

export const JOB_START_FAILED_MESSAGE = "İş başlatılamadı. Bağlantını kontrol edip tekrar dene.";

/**
 * Bir düğmenin kendi işinin evresi:
 *  idle → requesting (action çağrıldı) → waiting (sıraya yazıldı; `view` ilk yanıtla gelir) → finished (son görünüm);
 *  failed = iş AÇILAMADI (action hatası: mesaj Türkçe gelir) · untracked = iş açıldı ama durumu okunamadı (düğme yine serbest kalır).
 */
export type JobRunPhase =
  | { name: "idle" }
  | { name: "requesting" }
  | { name: "waiting"; jobId: string; view?: JobStatusView }
  | { name: "finished"; jobId: string; view: JobStatusView }
  | { name: "untracked"; jobId: string }
  | { name: "failed"; message: string };

type Local = { name: "idle" } | { name: "requesting" } | { name: "started"; jobId: string } | { name: "failed"; message: string };

function phaseOf(local: Local, snapshot: JobsSnapshot): JobRunPhase {
  if (local.name !== "started") return local;
  const { jobId } = local;
  if (snapshot.active?.id === jobId) return { name: "waiting", jobId, view: snapshot.active };
  const settled = snapshot.settled[jobId];
  if (settled !== undefined) return { name: "finished", jobId, view: settled };
  return snapshot.pendingId === jobId ? { name: "waiting", jobId } : { name: "untracked", jobId };
}

export interface JobRun {
  phase: JobRunPhase;
  /** Bu düğmenin işi isteniyor ya da sürüyor. */
  busy: boolean;
  /** Çalışma alanında BAŞKA bir iş sırada / çalışıyor: yenisi açılamaz. Yanıt vermeyen iş engel sayılmaz (yeni istek onu kapatır). */
  blocked: boolean;
  /** İşi sıraya yazar ve izlemeye alır; açılan işin kimliği, açılamadıysa undefined (evre `failed`). */
  start(request: RequestJobInput): Promise<string | undefined>;
  /** Evreyi sıfırlar (iş durmaz; yalnız bu düğme onu izlemeyi bırakır). */
  reset(): void;
  /** Ortak durum (şeritle aynı). */
  snapshot: JobsSnapshot;
}

/**
 * Düğmenin iş başlatma durumu: action'ı `callAction` ile çağırır, açılan işi ortak depoda izler ve evreyi depodan TÜRETİR (iş durumu
 * bu bileşende kopyalanmaz). Çağıran düğmeyi `busy` / `blocked` iken kapatır.
 */
export function useJobRun(seed: JobsSeed): JobRun {
  const snapshot = useJobsStatus(seed);
  const [local, setLocal] = useState<Local>({ name: "idle" });

  const start = useCallback(async (request: RequestJobInput): Promise<string | undefined> => {
    setLocal({ name: "requesting" });
    const result = await callAction(() => requestJobAction(request), JOB_START_FAILED_MESSAGE);
    if (!result.ok) {
      setLocal({ name: "failed", message: result.message });
      return undefined;
    }
    jobStatusStore.follow(result.jobId);
    setLocal({ name: "started", jobId: result.jobId });
    return result.jobId;
  }, []);

  const reset = useCallback(() => setLocal({ name: "idle" }), []);

  const phase = phaseOf(local, snapshot);
  const mineId = local.name === "started" ? local.jobId : undefined;
  const otherActive = snapshot.active !== undefined && snapshot.active.id !== mineId && !snapshot.active.stale;
  const otherPending = snapshot.pendingId !== undefined && snapshot.pendingId !== mineId;
  return {
    phase,
    busy: phase.name === "requesting" || phase.name === "waiting",
    blocked: otherActive || otherPending,
    start,
    reset,
    snapshot,
  };
}
