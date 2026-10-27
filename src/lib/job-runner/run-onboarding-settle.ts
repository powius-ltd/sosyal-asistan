/**
 * Başlangıç işinin harcama kapanışı: işin açtığı Apify koşularının mutabakatı (kısa, sınırlı bekleme) + toplam tutarı.
 *
 * `probe` hızlı olsun diye adımları mutabakat beklemeden koşar (hesap doğrulama, toplama, keşif: `reconcileWaitMs: 0`); gerçek tutarlar iş
 * sonunda BURADA, tek seferde kesinleştirilir. Mutabakatın tek doğru yeri yine `reconcileRun`'dır (`reconcileOpenRuns` çağırır): burada
 * yalnız aralıkla yeniden denenir. Süre dolarsa koşu "mutabakat bekliyor" kalır (`actualUsd` yok, 0 değil; `reserved_usd` tavana sayılmaya
 * devam eder). Tutar işe bağlı koşulardan okunur (`collection_runs.panel_job_id`, `lib/job-scope.ts`). FIRLATMAZ.
 */
import "server-only";

import { reconcileOpenRuns } from "@/lib/apify/reconcile";
import { roundUsd } from "@/lib/apify/usd";
import type { AdminClient } from "@/lib/supabase/admin";

/** İşin harcaması. Alan yok = okunamadı / kesinleşmedi (0 değil). */
export interface JobSpend {
  reservedUsd?: number;
  actualUsd?: number;
  /** Gerçek tutarı henüz kesinleşmemiş koşu sayısı. */
  pending: number;
}

export interface SettleOptions {
  client: AdminClient;
  workspaceId: string;
  jobId: string;
  /** Mutabakat için en çok bekleme (ms). 0 = tek deneme. */
  waitMs?: number;
  intervalMs?: number;
  clock?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  /** Mutabakat turu (test sahtesini verir). */
  reconcile?: typeof reconcileOpenRuns;
  /** Durma istendiyse beklenmez (iptal / süre tavanı). */
  shouldStop?: () => boolean;
  log?: (line: string) => void;
}

export const SETTLE_WAIT_MS = 90_000;
export const SETTLE_INTERVAL_MS = 10_000;
const messageOf = (error: unknown): string => (error instanceof Error ? error.message : "bilinmeyen hata");

export async function settleJobSpend(options: SettleOptions): Promise<JobSpend> {
  const { client, workspaceId, jobId } = options;
  const log = options.log ?? (() => undefined);
  const clock = options.clock ?? (() => new Date());
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const reconcile = options.reconcile ?? reconcileOpenRuns;
  const waitMs = options.waitMs ?? SETTLE_WAIT_MS;
  const intervalMs = options.intervalMs ?? SETTLE_INTERVAL_MS;

  try {
    for (let waited = 0; ; waited += intervalMs) {
      const summary = await reconcile({ workspaceId }, { client, now: clock() });
      if (summary.pending + summary.errors === 0 || waited >= waitMs || options.shouldStop?.() === true) break;
      await sleep(intervalMs);
    }
  } catch (error) {
    log(`Uyarı: mutabakat denenemedi (${messageOf(error)}); tutarlar "bekliyor" kalır.`);
  }

  const { data, error } = await client
    .from("collection_runs")
    .select("reserved_usd, actual_usd, usage_settled_at, billing, external_run_id")
    .eq("workspace_id", workspaceId)
    .eq("panel_job_id", jobId)
    .eq("provider", "apify");
  if (error) {
    log(`Uyarı: işin koşu kayıtları okunamadı (${error.message}); harcama özeti eksik.`);
    return { pending: 0 };
  }
  const rows = data ?? [];
  const settled = rows.filter((row) => row.actual_usd !== null && row.usage_settled_at !== null);
  return {
    reservedUsd: roundUsd(rows.reduce((sum, row) => sum + row.reserved_usd, 0)),
    ...(settled.length > 0 ? { actualUsd: roundUsd(settled.reduce((sum, row) => sum + (row.actual_usd ?? 0), 0)) } : {}),
    pending: rows.filter((row) => row.billing === "metered" && row.external_run_id !== null && row.usage_settled_at === null).length,
  };
}
