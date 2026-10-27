/**
 * Aylık maliyet özeti. Ay toplamı `reserve_budget()` ile AYNI kural: Σ greatest(actual, reserved); mutabakatı olmayan
 * koşuda (`actual_usd` NULL) rezerve tutar sayılır, gerçek tutar 0 varsayılmaz. Ay = workspace saat diliminde takvim ayı.
 * Tavan grupları: `apify` ↔ diğer tüm sağlayıcılar (LLM/STT/CLI; sözleşme süiti "apify olmayan" der).
 */
import { fromZonedTime } from "date-fns-tz";

import type { CostBucket, CostSummary, Workspace } from "@/lib/domain/run";
import { toDayKey } from "@/lib/format";
import { RepositoryError } from "@/lib/data/repository";
import type { SupabaseContext } from "@/lib/data/supabase/context";
import { opt } from "@/lib/data/supabase/mappers/common";
import { runBillingOf, runProviderOf } from "@/lib/data/supabase/mappers/enums";
import { isUsageSettled } from "@/lib/data/supabase/mappers/runs";
import { fetchAllRows } from "@/lib/data/supabase/paging";
import { subscriptionUsage } from "@/lib/data/views/subscription-usage";

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const round4 = (value: number) => Math.round(value * 10_000) / 10_000;

/** Bir tarih anının workspace saat diliminde "YYYY-MM" anahtarı. */
export function monthKeyOf(at: Date, timeZone: string): string {
  return (toDayKey(at, timeZone) ?? at.toISOString().slice(0, 10)).slice(0, 7);
}

/** "YYYY-MM" ayının [başı, sonraki ayın başı) aralığı, workspace saat diliminde (ISO UTC). */
export function monthRange(month: string, timeZone: string): { from: string; to: string } {
  const [year, mon] = month.split("-").map(Number);
  const next = mon === 12 ? `${year + 1}-01` : `${year}-${String(mon + 1).padStart(2, "0")}`;
  const start = (key: string) => fromZonedTime(`${key}-01T00:00:00`, timeZone).toISOString();
  return { from: start(month), to: start(next) };
}

interface CostRun {
  provider: string;
  billing: string;
  reserved_usd: number;
  actual_usd: number | null;
  usage_settled_at: string | null;
  price_unknown: boolean;
  input_tokens: number | null;
  output_tokens: number | null;
  model: string | null;
  started_at: string;
}

/** Mutabık = gerçek tutar var VE kesinleşti (Apify'da `usage_settled_at`; diğer sağlayıcılarda yazıldığı anda). */
const isReconciled = (r: CostRun) => r.actual_usd !== null && isUsageSettled(r);

/**
 * Tavana sayılan tutar `reserve_budget` ile AYNI kuraldır: Σ greatest(ham actual, reserved) — geçici (kesinleşmemiş) actual
 * da bir alt sınırdır, tavan payını eksik saymaz. Gösterilen `actualUsd` ve mutabakat sayacı yalnız kesinleşmişleri sayar.
 */
function bucket(runs: CostRun[], capUsd: number | undefined): CostBucket {
  return {
    capUsd,
    committedUsd: round4(runs.reduce((sum, r) => sum + Math.max(r.actual_usd ?? 0, r.reserved_usd), 0)),
    actualUsd: round4(runs.reduce((sum, r) => sum + (isReconciled(r) ? (r.actual_usd ?? 0) : 0), 0)),
    runs: runs.length,
    unreconciledRuns: runs.filter((r) => !isReconciled(r)).length,
    priceUnknownRuns: runs.filter((r) => r.price_unknown).length,
  };
}

/** `month` verilmezse içinde bulunulan ay (workspace saat diliminde, `ctx.now()`). */
export async function getCostSummary(ctx: SupabaseContext, workspace: Workspace, month?: string): Promise<CostSummary> {
  if (month !== undefined && !MONTH_PATTERN.test(month)) throw new RepositoryError("invalid_input", `Ay "YYYY-MM" biçiminde olmalı: ${month}`);
  const key = month ?? monthKeyOf(ctx.now(), workspace.timezone);
  const { from, to } = monthRange(key, workspace.timezone);
  const runs = await fetchAllRows((rangeFrom, rangeTo) =>
    ctx.db
      .from("collection_runs")
      .select("id, provider, billing, reserved_usd, actual_usd, usage_settled_at, price_unknown, input_tokens, output_tokens, model, started_at")
      .eq("workspace_id", workspace.id)
      .gte("started_at", from)
      .lt("started_at", to)
      .order("id", { ascending: true })
      .range(rangeFrom, rangeTo),
  );
  const metered = runs.filter((r) => r.billing === "metered");
  const apify = bucket(metered.filter((r) => r.provider === "apify"), workspace.apifyMonthlyCapUsd);
  // Abonelik koşuları (agy/Claude CLI) tutara ve mutabakat sayacına girmez: yalnız çağrı sayısı (`subscription`).
  const llm = bucket(metered.filter((r) => r.provider !== "apify"), workspace.llmMonthlyCapUsd);
  const subscription = subscriptionUsage(
    runs.flatMap((r) =>
      r.billing === "subscription"
        ? [
            {
              provider: runProviderOf(r.provider),
              billing: runBillingOf(r.billing),
              startedAt: r.started_at,
              inputTokens: opt(r.input_tokens),
              outputTokens: opt(r.output_tokens),
              model: opt(r.model),
            },
          ]
        : [],
    ),
  );
  return { month: key, apify, llm, subscription, totalCommittedUsd: round4(apify.committedUsd + llm.committedUsd) };
}
