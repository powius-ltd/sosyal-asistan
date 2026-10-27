/**
 * İşçinin GERÇEK kredi bağlaması: `JobCreditsPort`'u kredi defterinin sunucu işlevlerine (`lib/credits/ledger.ts`, service role) bağlar.
 * Zorlama anahtarı tek yerden okunur (`lib/credits/enforcement.ts`). İşçi betiği (`scripts/job-worker.mts`) ve işçinin DB testleri içe aktarır.
 */
import "server-only";

import { isCreditsEnforced } from "@/lib/credits/enforcement";
import { readCreditHold, releaseCredits, settleCredits, sweepJobCredits } from "@/lib/credits/ledger";
import type { JobCreditsPort } from "@/lib/job-runner/job-credits";
import type { AdminClient } from "@/lib/supabase/admin";

export function createRealJobCredits(client: AdminClient, enforced: boolean = isCreditsEnforced()): JobCreditsPort {
  return {
    enforced,
    findHold: (key) => readCreditHold(client, key),
    settle: (input) => settleCredits(client, input),
    release: (key) => releaseCredits(client, key),
    sweep: (queue) => sweepJobCredits(client, queue),
  };
}
