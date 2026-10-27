/**
 * Tek Apify koşusunun yaşam döngüsü (yerel/tek seferlik toplama; bloklayan bekleme YALNIZ burada, sunucu yolunda değil):
 *
 *   `startBudgetedRun` (fiyat oku → rezerve et → başlat) → `waitForRun` → `succeeded` → dataset okuma
 *   ... çağıran: parse → ingest → `finishIngested` (`ingested` + öğe sayısı + elenen satırlar).
 *   Gerçek tutar mutabakatı burada YAPILMAZ: tur sonunda `run-report.ts` (kullanım oturduktan sonra).
 *
 * Hata sözleşmesi: bu modül HİÇ fırlatmaz; sonuç `ScrapeResult`'tır. Tavan aşımı ve Apify yapılandırma hatası
 * `stop` ile işaretlenir (kalan koşular başlatılmaz). Koşu bir kez başladıysa satır her zaman sonuçlandırılır ya da
 * `succeeded` bırakılır (veri henüz işlenmedi) — `running` takılı kalmaz.
 *
 * Saat: koşu yaşam döngüsü damgaları (`finished_at`) GERÇEK saatle (`deps.clock`) yazılır, turun `now`'ı ile DEĞİL:
 * `now` tur başında alınır ve koşunun DB'deki `started_at`'inden eski olabilir (`finished_at >= started_at` check'i).
 */
import "server-only";

import { BudgetExceededError, markRunFinished, type RunOutcome } from "@/lib/apify/budget";
import { ApifyConfigError } from "@/lib/apify/client";
import { toCollectionRunStatus } from "@/lib/apify/status";
import type { CollectContext, PlannedJob } from "@/lib/collection/types";

export type ScrapeResult =
  | { ok: true; runId: string; items: unknown[] }
  | { ok: false; runId?: string; reason: string; stop?: string };

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "bilinmeyen hata";
}

/** Bitmiş ama başarısız Apify durumu → `collection_runs` durumu. */
function failureStatus(apifyStatus: string, timedOut: boolean): Exclude<RunOutcome["status"], "succeeded" | "ingested"> {
  if (timedOut) return "timed_out";
  const status = toCollectionRunStatus(apifyStatus);
  return status === "aborted" || status === "timed_out" ? status : "failed";
}

/** Yaşam döngüsü güncellemesi başarısız olursa tur durmaz ama sessiz kalmaz (nota yazılır). */
async function stamp(ctx: CollectContext, runId: string, outcome: RunOutcome): Promise<void> {
  try {
    const applied = await markRunFinished(runId, outcome, { client: ctx.deps.client, now: ctx.deps.clock() });
    if (!applied) ctx.notes.push(`Koşu durumu güncellenmedi (${outcome.status}): kayıt beklenen durumda değil.`);
  } catch (error) {
    ctx.notes.push(`Koşu durumu güncellenemedi (${outcome.status}): ${messageOf(error)}`);
  }
}

/** Koşuyu başlatır, bitmesini bekler, dataset'i okur. */
export async function executeScrape(ctx: CollectContext, job: PlannedJob): Promise<ScrapeResult> {
  const { deps, workspaceId } = ctx;

  let started: Awaited<ReturnType<typeof deps.start>>;
  try {
    started = await deps.start(
      {
        workspaceId,
        actorId: job.spec.actorId,
        input: job.spec.input,
        kind: job.spec.kind,
        expectedResults: job.spec.expectedResults,
        targetLabel: job.label,
        purpose: ctx.purpose,
      },
      { client: deps.client, now: deps.clock() },
    );
  } catch (error) {
    if (error instanceof BudgetExceededError) return { ok: false, reason: error.message, stop: "bütçe tavanı" };
    if (error instanceof ApifyConfigError) return { ok: false, reason: error.message, stop: "Apify yapılandırması" };
    return { ok: false, reason: `Koşu başlatılamadı: ${messageOf(error)}` };
  }

  const runId = started.run.id;
  ctx.runIds.push(runId);
  // Apify'a gitmiş her koşunun gerçek tutarı (başarısız/yarıda kalan dahil) tur sonunda mutabakata girer.
  ctx.pending.set(runId, { externalRunId: started.externalRunId });
  ctx.log(`  koşu başladı: ${job.label} (tahmin ${started.estimate.amountUsd} USD)`);

  let waited: Awaited<ReturnType<typeof deps.wait>>;
  try {
    waited = await deps.wait(started.externalRunId);
  } catch (error) {
    // Bekleme hatası (ağ): koşu Apify'da sürüyor olabilir; satır `running` kalır, mutabakat/webhook ilerletir.
    return { ok: false, runId, reason: `Koşu beklenirken hata (koşu Apify'da sürüyor olabilir): ${messageOf(error)}` };
  }

  if (waited.timedOut || waited.run.status !== "SUCCEEDED") {
    const reason = waited.timedOut ? "zaman aşımı (koşu iptal edildi)" : `Apify durumu ${waited.run.status}`;
    await stamp(ctx, runId, { status: failureStatus(waited.run.status, waited.timedOut), error: reason });
    return { ok: false, runId, reason: `Koşu tamamlanmadı: ${reason}` };
  }

  await stamp(ctx, runId, { status: "succeeded" });
  try {
    const items = await deps.datasetItems(started.datasetId);
    return { ok: true, runId, items };
  } catch (error) {
    await noteRunError(ctx, runId, `Dataset okunamadı: ${messageOf(error)}`);
    return { ok: false, runId, reason: `Dataset okunamadı: ${messageOf(error)}` };
  }
}

/** Veri işlenemedi (parse/ingest hatası): durum `succeeded` kalır (dataset Apify'da durur), sebep `error`'a yazılır. */
export async function noteRunError(ctx: CollectContext, runId: string, message: string): Promise<void> {
  await ctx.deps.client
    .from("collection_runs")
    .update({ error: message.slice(0, 500) })
    .eq("id", runId);
}

/** Veri DB'ye yazıldı: elenen satırlar (`not_item_reasons`) + öğe sayısı + `ingested`. Mutabakat tur sonunda. */
export async function finishIngested(
  ctx: CollectContext,
  runId: string,
  summary: { itemCount: number; notItems: { reason: string }[] },
): Promise<void> {
  const { error } = await ctx.deps.client
    .from("collection_runs")
    .update({ not_item_reasons: summary.notItems })
    .eq("id", runId);
  if (error) ctx.notes.push(`Koşu kaydına elenen satırlar yazılamadı (${error.message}).`);
  await markRunFinished(
    runId,
    { status: "ingested", itemCount: summary.itemCount },
    { client: ctx.deps.client, now: ctx.deps.clock() },
  );
}
