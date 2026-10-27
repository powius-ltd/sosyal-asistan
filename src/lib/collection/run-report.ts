/**
 * Tur sonu: gerçek tutar mutabakatı ve bu turda açılan koşuların maliyet raporu.
 *
 * Mutabakatın TEK doğru yeri `lib/apify/budget.ts` `reconcileRun`'dır: Apify kullanımı koşu bittikten sonra KADEMELİ işlenir,
 * bu yüzden `actual_usd` önce geçici (yalnız yukarı) yazılır, koşu bitiminden ≥ 60 sn geçip iki ardışık okumada değer sabitlenince
 * kesinleşir (`reserved_usd` yalnız o zaman iner). Burada oturma/yaş/tekrar-okuma mantığı YOKTUR: yalnız `reconcileRun` aralıkla
 * tekrar çağrılır. Süre dolarsa koşu `actualUsd: undefined` ("mutabakat bekliyor", 0 DEĞİL) kalır; cron `reconcileOpenRuns` tamamlar.
 */
import "server-only";

import { isReconcilePending } from "@/lib/apify/reconcile";
import { roundUsd } from "@/lib/apify/usd";
import type { CollectContext, CollectSummary, RunReport } from "@/lib/collection/types";

/** `reconcileRun` çağrıları arası bekleme. */
export const RECONCILE_INTERVAL_MS = 10_000;

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "bilinmeyen hata";
}

/** Bir koşuyu mutabakata sokar; işi bittiyse (kesinleşti ya da mutabakat konusu değil) bekleyenlerden çıkarır. Hata turu durdurmaz. */
async function settleOne(ctx: CollectContext, runId: string): Promise<void> {
  try {
    const result = await ctx.deps.reconcile(runId, { client: ctx.deps.client, now: ctx.deps.clock() });
    if (!isReconcilePending(result)) ctx.pending.delete(runId);
  } catch (error) {
    ctx.notes.push(`Mutabakat denemesi başarısız (${messageOf(error)}); koşu bekleyenlerde kaldı.`);
  }
}

/**
 * Bekleyen koşuları `waitMs`'ye kadar `intervalMs` aralıkla `reconcileRun`'a sokar. `waitMs <= 0`: hiç deneme yok (koşular bekleyen kalır).
 * Tüm koşular bir turda birlikte denenir: bekleme koşu sayısıyla değil, en yeni koşunun kesinleşme süresiyle artar.
 */
export async function settleReconciliation(
  ctx: CollectContext,
  waitMs: number,
  intervalMs: number = RECONCILE_INTERVAL_MS,
): Promise<void> {
  if (waitMs <= 0) return;
  let waited = 0;
  for (;;) {
    for (const runId of [...ctx.pending.keys()]) await settleOne(ctx, runId);
    if (ctx.pending.size === 0 || waited >= waitMs) return;
    await ctx.deps.sleep(intervalMs);
    waited += intervalMs;
  }
}

export async function readRunReports(
  ctx: CollectContext,
): Promise<{ runs: RunReport[]; cost: CollectSummary["cost"] }> {
  if (ctx.runIds.length === 0) return { runs: [], cost: { reservedUsd: 0, pendingReconcile: 0 } };
  const { data, error } = await ctx.deps.client
    .from("collection_runs")
    .select("id, kind, target_label, status, billing, reserved_usd, actual_usd, usage_settled_at, item_count, external_run_id, started_at")
    .eq("workspace_id", ctx.workspaceId)
    .in("id", ctx.runIds)
    .order("started_at", { ascending: true });
  if (error) {
    ctx.notes.push(`Koşu kayıtları okunamadı (${error.message}); maliyet raporu eksik.`);
    return { runs: [], cost: { reservedUsd: 0, pendingReconcile: ctx.pending.size } };
  }

  const rows = data ?? [];
  // Gösterilen gerçek tutar yalnız KESİNLEŞMİŞ olandır; geçici (alt sınır) tutar "mutabakat bekliyor" sayılır.
  const settled = (row: (typeof rows)[number]) => row.actual_usd !== null && row.usage_settled_at !== null;
  const runs = rows.map(
    (row): RunReport => ({
      runId: row.id,
      kind: row.kind,
      label: row.target_label ?? row.kind,
      status: row.status,
      reservedUsd: row.reserved_usd,
      actualUsd: settled(row) ? (row.actual_usd ?? undefined) : undefined,
      itemCount: row.item_count ?? undefined,
    }),
  );
  const actuals = rows.filter(settled);
  return {
    runs,
    cost: {
      reservedUsd: roundUsd(rows.reduce((sum, row) => sum + row.reserved_usd, 0)),
      actualUsd: actuals.length > 0 ? roundUsd(actuals.reduce((sum, row) => sum + (row.actual_usd ?? 0), 0)) : undefined,
      // Apify'a gitmiş ama gerçek tutarı henüz kesinleşmemiş ücretli koşular (0 değil: bilinmiyor).
      pendingReconcile: rows.filter((row) => row.billing === "metered" && row.external_run_id !== null && row.usage_settled_at === null).length,
    },
  };
}
