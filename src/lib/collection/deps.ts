/**
 * `CollectDeps` varsayılanları: gerçek Apify/Supabase/skor modülleri. Testler yalnız ihtiyaç duydukları kısmı verir.
 */
import "server-only";

import { reconcileRun } from "@/lib/apify/reconcile";
import { getDatasetItems } from "@/lib/apify/client";
import { estimateActorCost } from "@/lib/apify/pricing";
import { startBudgetedRun } from "@/lib/apify/start";
import { waitForRun } from "@/lib/apify/wait-for-run";
import { afterCollect } from "@/lib/collection/after-collect";
import type { CollectDeps, ResolvedDeps } from "@/lib/collection/types";
import { recomputeWorkspaceScores } from "@/lib/scoring";
import { getAdminClient } from "@/lib/supabase/admin";

/** Bir koşuyu en çok bu kadar bekleriz; aşılırsa koşu iptal edilir (başıboş para harcamasın). */
const RUN_TIMEOUT_MS = 240_000;

export function resolveDeps(deps: CollectDeps = {}): ResolvedDeps {
  return {
    client: deps.client ?? getAdminClient(),
    estimate: deps.estimate ?? estimateActorCost,
    start: deps.start ?? startBudgetedRun,
    wait: deps.wait ?? ((runId) => waitForRun(runId, { timeoutMs: RUN_TIMEOUT_MS })),
    datasetItems: deps.datasetItems ?? ((datasetId) => getDatasetItems(datasetId)),
    reconcile: deps.reconcile ?? reconcileRun,
    clock: deps.clock ?? (() => new Date()),
    recompute: deps.recompute ?? ((workspaceId, now) => recomputeWorkspaceScores(workspaceId, now)),
    sleep: deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
    afterCollect: deps.afterCollect ?? afterCollect,
  };
}
