/**
 * Abonelik koşularının sayacı (`CostSummary.subscription`): agy/Gemini ve Claude CLI çağrıları tutarsızdır
 * (`actualUsd` yok, tavana girmez), yalnız sayılır. Mock ve Supabase maliyet özeti AYNI fonksiyonu kullanır.
 */
import { shadowApiCost } from "@/lib/domain/provider-pricing";
import type { CollectionRun, SubscriptionUsage } from "@/lib/domain/run";

export function subscriptionUsage(runs: readonly Pick<CollectionRun, "provider" | "billing" | "startedAt" | "inputTokens" | "outputTokens" | "model">[]): SubscriptionUsage {
  const byProvider: SubscriptionUsage["byProvider"] = {};
  let count = 0;
  for (const run of runs) {
    if (run.billing !== "subscription") continue;
    byProvider[run.provider] = (byProvider[run.provider] ?? 0) + 1;
    count += 1;
  }
  return { runs: count, byProvider, shadow: shadowApiCost(runs) };
}
