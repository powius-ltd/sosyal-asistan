/**
 * Koşu satırı → `CollectionRun`. Farklı adlar: `itemsExpected` ← `expected_results`, `itemsIngested` ← `item_count`.
 * `actual_usd` NULL = mutabakat YOK (0 değil): `actualUsd` undefined kalır. Apify kullanımı koşu bittikten sonra kademeli
 * işlenir: `actual_usd` önce GEÇİCİ (alt sınır) yazılır ve `usage_settled_at` dolana kadar kesin değildir — domain'de
 * `actualUsd` yalnız KESİNLEŞMİŞ tutardır (`isUsageSettled`); ay toplamı (`greatest`) ham değeri kullanır, çünkü geçici tutar
 * de bir alt sınırdır ve tavan payını asla eksik saymaz.
 */
import type { CollectionRun } from "@/lib/domain/run";
import type { Tables } from "@/lib/supabase/database.types";
import { iso, isoOpt, opt } from "@/lib/data/supabase/mappers/common";
import { runBillingOf, runKindOf, runProviderOf, runPurposeOf, runStatusOf } from "@/lib/data/supabase/mappers/enums";

export const RUN_COLUMNS =
  "id, workspace_id, provider, kind, status, billing, purpose, target_label, external_run_id, reserved_usd, actual_usd, usage_settled_at, price_unknown, expected_results, item_count, input_tokens, output_tokens, model, panel_job_id, error, started_at, finished_at" as const;

export type RunRow = Pick<
  Tables<"collection_runs">,
  | "id"
  | "workspace_id"
  | "provider"
  | "kind"
  | "status"
  | "billing"
  | "purpose"
  | "target_label"
  | "external_run_id"
  | "reserved_usd"
  | "actual_usd"
  | "usage_settled_at"
  | "price_unknown"
  | "expected_results"
  | "item_count"
  | "input_tokens"
  | "output_tokens"
  | "model"
  | "panel_job_id"
  | "error"
  | "started_at"
  | "finished_at"
>;

/**
 * `actual_usd` kesin mi? Apify'da yalnız `usage_settled_at` doluysa; diğer sağlayıcılarda (LLM API) tutar yazıldığı anda
 * kesindir (kullanım sonradan işlenmez). Abonelik koşusunda `actual_usd` hiç yoktur.
 */
export function isUsageSettled(row: Pick<RunRow, "provider" | "usage_settled_at">): boolean {
  return row.provider !== "apify" || row.usage_settled_at !== null;
}

export function toCollectionRun(row: RunRow): CollectionRun {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    provider: runProviderOf(row.provider),
    kind: runKindOf(row.kind),
    status: runStatusOf(row.status),
    billing: runBillingOf(row.billing),
    purpose: row.purpose === null || row.purpose === undefined ? undefined : runPurposeOf(row.purpose),
    targetLabel: opt(row.target_label),
    externalRunId: opt(row.external_run_id),
    reservedUsd: row.reserved_usd,
    actualUsd: isUsageSettled(row) ? opt(row.actual_usd) : undefined,
    priceUnknown: row.price_unknown,
    itemsExpected: opt(row.expected_results),
    itemsIngested: opt(row.item_count),
    inputTokens: opt(row.input_tokens),
    outputTokens: opt(row.output_tokens),
    model: opt(row.model),
    panelJobId: opt(row.panel_job_id),
    error: opt(row.error),
    startedAt: iso(row.started_at),
    finishedAt: isoOpt(row.finished_at),
  };
}
