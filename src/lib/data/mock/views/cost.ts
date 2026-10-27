/**
 * Mock görünümü: aylık maliyet özeti. Ay toplamı = Σ greatest(actual, reserved); mutabakatı
 * yapılmamış koşuda (actualUsd undefined) rezerve tutar sayılır — gerçek tutar 0 varsayılmaz.
 */
import type { CollectionRun, CostBucket, CostSummary, RunProvider, Workspace } from "@/lib/domain/run";
import { toDayKey } from "@/lib/format";
import { subscriptionUsage } from "@/lib/data/views/subscription-usage";

/** Kullanıma göre ücretli LLM/STT sağlayıcıları (abonelik koşuları `billing = "subscription"` ile ayrı sayılır). */
const LLM_PROVIDERS: readonly RunProvider[] = ["anthropic", "deepgram", "openai", "gemini", "claude_cli"];

const round4 = (v: number) => Math.round(v * 10_000) / 10_000;

/** ISO → "YYYY-MM" (workspace saat diliminde). */
export function monthKey(iso: string, timeZone: string): string {
  return (toDayKey(iso, timeZone) ?? iso.slice(0, 10)).slice(0, 7);
}

function costBucket(runs: CollectionRun[], capUsd: number | undefined): CostBucket {
  return {
    capUsd,
    committedUsd: round4(runs.reduce((sum, r) => sum + Math.max(r.actualUsd ?? 0, r.reservedUsd), 0)),
    actualUsd: round4(runs.reduce((sum, r) => sum + (r.actualUsd ?? 0), 0)),
    runs: runs.length,
    unreconciledRuns: runs.filter((r) => r.actualUsd === undefined).length,
    priceUnknownRuns: runs.filter((r) => r.priceUnknown).length,
  };
}

export function summarizeCost(runs: CollectionRun[], ws: Workspace, month: string): CostSummary {
  const inMonth = runs.filter((r) => monthKey(r.startedAt, ws.timezone) === month);
  const apify = costBucket(
    inMonth.filter((r) => r.provider === "apify"),
    ws.apifyMonthlyCapUsd,
  );
  // Abonelik koşuları (agy/Claude CLI) tutara ve mutabakat sayacına girmez: 0 USD "ölçüldü" değil, "tutar yok".
  const llm = costBucket(
    inMonth.filter((r) => r.billing === "metered" && LLM_PROVIDERS.includes(r.provider)),
    ws.llmMonthlyCapUsd,
  );
  return { month, apify, llm, subscription: subscriptionUsage(inMonth), totalCommittedUsd: round4(apify.committedUsd + llm.committedUsd) };
}
