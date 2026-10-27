/**
 * Keşfin ÜCRETLİ koşuları için tavan muhasebesi. Her koşu mevcut bütçeli yoldan geçer (`executeScrape` → `startBudgetedRun`: fiyat oku →
 * `reserveBudget` → başlat; gerçek tutar `reconcileRun`); burada yalnız ÇAĞIRANIN verdiği tavan (`maxUsd`) korunur:
 *
 *  - Koşudan ÖNCE tahmin okunur (para harcamaz). Bu turda rezerve edilen + tahmin tavanı aşıyorsa koşu HİÇ başlatılmaz.
 *  - Sonuç sayısı tavana göre küçültülebilir (`affordableCount`); alt sınırın altına düşüyorsa koşu yapılmaz.
 *  - Çalışma alanının aylık tavanı ayrıca `reserve_budget`'tadır: aşılırsa kalan ücretli koşular durur (`ctx.stop`).
 */
import "server-only";

import { roundUsd } from "@/lib/apify/usd";
import { resolveDeps } from "@/lib/collection/deps";
import { readRunReports, settleReconciliation } from "@/lib/collection/run-report";
import { executeScrape, type ScrapeResult } from "@/lib/collection/run-scrape";
import type { CollectContext, CollectDeps, CollectSummary } from "@/lib/collection/types";
import type { ScrapeJobSpec } from "@/lib/platforms/types";

export interface PaidRun {
  ctx: CollectContext;
  /** Çağıranın tavanı (USD) ve bu turda başlatılan koşuların tahmini toplamı. */
  maxUsd: number;
  reservedUsd: number;
}

export function createPaidRun(options: { workspaceId: string; now: Date; maxUsd: number; log?: (line: string) => void }, depsIn: CollectDeps = {}): PaidRun {
  const maxUsd = Number.isFinite(options.maxUsd) && options.maxUsd > 0 ? options.maxUsd : 0;
  return {
    ctx: { workspaceId: options.workspaceId, now: options.now, deps: resolveDeps(depsIn), log: options.log ?? (() => undefined), runIds: [], pending: new Map(), notes: [], followers: new Map() },
    maxUsd,
    reservedUsd: 0,
  };
}

const remainingUsd = (run: PaidRun): number => Math.max(0, roundUsd(run.maxUsd - run.reservedUsd));

/** Kalan tavana sığan sonuç sayısı (en çok `wanted`); `min`'in altındaysa 0 (koşu yapılmaz). Fiyat okunamazsa temkinli varsayım kullanılır. */
export async function affordableCount(run: PaidRun, actorId: string, wanted: number, min: number): Promise<number> {
  if (wanted < 1 || run.ctx.stop !== undefined) return 0;
  const remaining = remainingUsd(run);
  if (remaining <= 0) return 0;
  const estimate = await run.ctx.deps.estimate(actorId, wanted);
  if (estimate.amountUsd <= remaining) return wanted;
  const perResult = estimate.amountUsd / wanted;
  const fits = perResult > 0 ? Math.floor(remaining / perResult + 1e-9) : wanted;
  return fits >= Math.min(min, wanted) ? Math.min(fits, wanted) : 0;
}

export type PaidResult = ScrapeResult | { ok: false; skipped: true; reason: string };

/** Koşuyu tavan içindeyse başlatır ve bekler. Tavan aşılıyorsa ya da tur durdurulduysa koşu başlamaz (`skipped`). */
export async function runWithinBudget(run: PaidRun, job: { label: string; spec: ScrapeJobSpec }): Promise<PaidResult> {
  if (run.ctx.stop !== undefined) return { ok: false, skipped: true, reason: `atlandı (${run.ctx.stop})` };
  const estimate = await run.ctx.deps.estimate(job.spec.actorId, job.spec.expectedResults);
  if (roundUsd(run.reservedUsd + estimate.amountUsd) > roundUsd(run.maxUsd)) {
    return { ok: false, skipped: true, reason: `tahmin (${estimate.amountUsd} USD) kalan tavanı (${remainingUsd(run)} USD) aşıyor: koşu başlatılmadı` };
  }
  const result = await executeScrape(run.ctx, { label: job.label, spec: job.spec, targets: [], estimatedUsd: estimate.amountUsd, priceUnknown: estimate.priceUnknown });
  // Koşu açıldıysa (başarısız bitse bile) tutarı rezerve edilmiştir: tavandan düşer.
  if (result.ok || result.runId !== undefined) run.reservedUsd = roundUsd(run.reservedUsd + estimate.amountUsd);
  if (!result.ok && result.stop !== undefined) run.ctx.stop = result.stop;
  return result;
}

/**
 * Tur sonu: mutabakat (en çok `waitMs`) + bu turda açılan koşuların maliyeti. `reservedUsd` TAVANA sayılan tutardır (başlatılan koşuların
 * tahmini; mutabakat rezerveyi indirse de çağıranın tavan hesabı değişmez); `actualUsd` yalnız kesinleşen tutardır (yoksa "bekliyor", 0 değil).
 */
export async function closePaidRun(run: PaidRun, waitMs: number): Promise<CollectSummary["cost"]> {
  await settleReconciliation(run.ctx, waitMs);
  const { cost } = await readRunReports(run.ctx);
  return { reservedUsd: run.reservedUsd, pendingReconcile: cost.pendingReconcile, ...(cost.actualUsd === undefined ? {} : { actualUsd: cost.actualUsd }) };
}
