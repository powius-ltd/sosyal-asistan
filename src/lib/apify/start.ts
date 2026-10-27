/**
 * Bütçeli koşu başlatma: fiyat oku → tutar rezerve et → Apify'ı başlat → kimlikleri kaydet. Sıra sözleşmedir:
 *
 *  1. Fiyat okunur (`APIFY_TOKEN` yoksa BURADA düşer: rezervasyon açılmaz).
 *  2. `reserveBudget`: tavan aşılırsa `BudgetExceededError` — `POST /runs` HİÇ çağrılmaz, satır açılmaz.
 *  3. `startRun`. Başarısızsa rezervasyon 0'a çekilir + durum `failed` (`releaseReservation`), hata yeniden fırlatılır.
 *  4. `markRunStarted` (`running`). Kaydedilemezse Apify koşusu iptal edilir (başıboş para harcamasın), satır
 *     `aborted` yapılır ve rezerve tutar KORUNUR (koşu bir süre çalışmış olabilir), hata yeniden fırlatılır.
 *
 * Bilinen artık risk: `startRun` ağ zaman aşımıyla düşerse Apify koşuyu yine de açmış olabilir; rezervasyon 0'a
 * çekilir ve bu koşu izlenemez (external id yok). HTTP yanıtı alınmış hatalarda (4xx/5xx) koşu açılmamıştır.
 */
import "server-only";
import {
  abortRun,
  type ApifyWebhookSpec,
  startRun,
} from "@/lib/apify/client";
import {
  markRunFinished,
  markRunStarted,
  releaseReservation,
  reserveBudget,
  type BudgetDeps,
  type CollectionRunRow,
} from "@/lib/apify/budget";
import type { RunPurpose } from "@/lib/domain/run";
import { type CostEstimate, estimateActorCost } from "@/lib/apify/pricing";

export interface BudgetedRunRequest {
  workspaceId: string;
  actorId: string;
  /** Aktör girdisi (`ScrapeJobSpec.input`). */
  input: unknown;
  /** Domain `RunKind`: `profile`, `content`, `discovery_related`, `discovery_search`. */
  kind: string;
  /** Beklenen sonuç sayısı (`ScrapeJobSpec.expectedResults`): rezerve tutarın tabanı. */
  expectedResults: number;
  targetLabel?: string;
  /** `measurement`: ölçüm koşusu (`collection_runs.purpose`). */
  purpose?: RunPurpose;
  webhooks?: ApifyWebhookSpec[];
}

export interface BudgetedRun {
  /** Güncel `collection_runs` satırı (`running`). */
  run: CollectionRunRow;
  externalRunId: string;
  datasetId: string;
  estimate: CostEstimate;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "bilinmeyen hata";
}

export async function startBudgetedRun(request: BudgetedRunRequest, deps: BudgetDeps = {}): Promise<BudgetedRun> {
  const { amountUsd, unitPriceUsd, priceUnknown } = await estimateActorCost(request.actorId, request.expectedResults);
  const estimate: CostEstimate = { amountUsd, unitPriceUsd, priceUnknown };

  // Tavan aşılırsa burada fırlar; aşağıdaki startRun hiç çağrılmaz.
  const reserved = await reserveBudget(
    request.workspaceId,
    "apify",
    amountUsd,
    {
      kind: request.kind,
      targetLabel: request.targetLabel,
      expectedResults: request.expectedResults,
      priceUnknown,
      purpose: request.purpose,
    },
    deps,
  );

  let started: Awaited<ReturnType<typeof startRun>>;
  try {
    started = await startRun(request.actorId, request.input, { webhooks: request.webhooks });
  } catch (error) {
    await releaseReservation(reserved.id, `Apify başlatılamadı: ${messageOf(error)}`, deps).catch(() => false);
    throw error;
  }

  try {
    const marked = await markRunStarted(
      reserved.id,
      { externalRunId: started.runId, datasetId: started.datasetId },
      deps,
    );
    if (!marked) throw new Error("Koşu satırı `reserved` durumunda değil; başlatma kaydedilemedi.");
  } catch (error) {
    await abortRun(started.runId).catch(() => undefined);
    await markRunFinished(
      reserved.id,
      { status: "aborted", error: `Başlatma kaydedilemedi, Apify koşusu iptal edildi: ${messageOf(error)}` },
      deps,
    ).catch(() => false);
    throw error;
  }

  return {
    run: { ...reserved, status: "running", external_run_id: started.runId, dataset_id: started.datasetId },
    externalRunId: started.runId,
    datasetId: started.datasetId,
    estimate,
  };
}
