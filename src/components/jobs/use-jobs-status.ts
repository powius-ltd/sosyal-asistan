"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";

import type { JobsSeed } from "@/components/jobs/job-run-types";
import { EMPTY_JOBS_SNAPSHOT, jobStatusStore, type JobsSnapshot } from "@/components/jobs/job-status-store";

const serverSnapshot = (): JobsSnapshot => EMPTY_JOBS_SNAPSHOT;

/**
 * İş durumunu okur: sunucunun çizdiği tohumla başlar (sunucu çizimi ve ilk istemci çizimi AYNI şeyi gösterir), sonra sekmenin ortak
 * deposunu izler. Tohum her sunucu çiziminde yenilenir ve depoya işlenir; depo henüz bu çalışma alanıyla tohumlanmadıysa tohumun
 * kendisi döner. Yoklama deponun işidir (`job-status-store.ts`).
 */
export function useJobsStatus(seed: JobsSeed): JobsSnapshot {
  const snapshot = useSyncExternalStore(jobStatusStore.subscribe, jobStatusStore.getSnapshot, serverSnapshot);
  useEffect(() => {
    jobStatusStore.seed(seed.scope, seed.status);
  }, [seed]);
  const seeded = useMemo<JobsSnapshot>(
    () => ({ ...EMPTY_JOBS_SNAPSHOT, scope: seed.scope, ...(seed.status.active ? { active: seed.status.active } : {}), workerNeeded: seed.status.workerNeeded }),
    [seed],
  );
  return snapshot.scope === seed.scope ? snapshot : seeded;
}
