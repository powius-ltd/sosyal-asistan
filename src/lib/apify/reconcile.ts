/**
 * Mutabakat: Apify koşusunun GERÇEK tutarını (`usageTotalUsd`) koşu satırına yazar (TEK doğru yer). Rezervasyon ve koşu yaşam döngüsü
 * `budget.ts`'tedir; kurallar onun başlığındadır (geçici → kesin, `usage_settled_at`, 0 YAZILMAZ, abonelik koşusu mutabakata girmez).
 * Çağıranlar (toplama turu, cron) yalnız `reconcileRun`'ı tekrar çağırır; kendi bekleme / oturma mantığı yazmaz.
 */
import "server-only";
import { getRunRow, storeError, updateRun, type BudgetDeps } from "@/lib/apify/budget";
import { ApifyConfigError, getRun } from "@/lib/apify/client";
import { isTerminalRunStatus } from "@/lib/apify/status";
import { isUsableUsd, roundUsd } from "@/lib/apify/usd";
import { getAdminClient } from "@/lib/supabase/admin";

const RECONCILE_DEFAULT_LIMIT = 25;
const RECONCILE_DEFAULT_SINCE_DAYS = 3;
/** Koşu bitiminden bu süre geçmeden gerçek tutar kesinleşmez (Apify kullanımı kademeli işlenir). */
export const SETTLE_MIN_AGE_MS = 60_000;

export type ReconcileResult =
  /** KESİNLEŞTİ: `actual_usd` yazıldı, `usage_settled_at` atıldı, `reserved_usd` gerçek tutara indi (en çok eski rezerve kadar). */
  | { outcome: "reconciled"; actualUsd: number; reservedUsd: number }
  /**
   * Kesinleşmedi (çağıran sonra tekrar çağırır): `first_read` = ilk okuma (geçici tutar yazıldı, ikinci okuma bekleniyor) ·
   * `changed` = değer bir önceki okumadan FARKLI (artıyorsa geçici tutar yukarı güncellendi; düşükse eski tutar korunur) ·
   * `too_young` = değer sabit ama koşu bitimi < 60 sn. `reserved_usd` dokunulmadı; `actualUsd` geçici alt sınırdır.
   */
  | { outcome: "provisional"; actualUsd: number; reason: "first_read" | "changed" | "too_young" }
  | { outcome: "already_reconciled"; actualUsd?: number }
  | { outcome: "not_finished"; apifyStatus: string }
  /** Apify kullanımı bildirmedi ya da 0 gösteriyor (ücret ~30 sn gecikmeli işlenir): 0 YAZILMAZ, liste'de kalır. */
  | { outcome: "usage_unavailable" }
  /** Abonelik koşusu (agy/Claude CLI): tutar yoktur, mutabakat konusu değil. */
  | { outcome: "subscription" }
  | { outcome: "no_external_run" }
  | { outcome: "unsupported_provider" }
  | { outcome: "not_found" };

/** Sonuç tekrar çağrılınca değişebilir mi (mutabakat listesinde kalmalı mı)? Değilse koşu işi bitmiştir. */
export function isReconcilePending(result: ReconcileResult): boolean {
  return result.outcome === "provisional" || result.outcome === "not_finished" || result.outcome === "usage_unavailable";
}

/**
 * Bir Apify koşusunun gerçek tutarını (`usageTotalUsd`) `actual_usd`'ye iki aşamada yazar (TEK doğru yer):
 *  1. Geçici: her okumada tutar yalnız YUKARI güncellenir (`actual_usd`); `reserved_usd` dokunulmaz, `usage_settled_at` NULL kalır.
 *     Ay toplamı greatest(actual, reserved) olduğundan geçici alt sınır tavan payını asla eksik saymaz.
 *  2. Kesin: koşu bitiminden ≥ `SETTLE_MIN_AGE_MS` geçtiyse VE bu okuma bir önceki okumayla (DB'deki geçici tutar) AYNIYSA
 *     `usage_settled_at` atılır ve `reserved_usd` gerçek tutara iner (boşa çıkan rezerve serbest kalır; actual > reserved ise
 *     rezerve korunur, ay toplamı actual'ı sayar). Kesinleşmiş tutar bir daha değişmez.
 *  - Koşu henüz bitmediyse ya da kullanım okunamıyor/0 ise hiçbir şey yazılmaz (0 YAZILMAZ).
 *  - Bitiş anı: Apify `finishedAt`, yoksa bizim `finished_at`; ikisi de yoksa yaş 0 sayılır (kesinleşmez).
 * Aktarım hataları (`ApifyApiError`) yükselir; toplu yol `reconcileOpenRuns` bunları koşu başına yakalar.
 */
export async function reconcileRun(runId: string, deps: BudgetDeps = {}): Promise<ReconcileResult> {
  const row = await getRunRow(runId, deps);
  if (!row) return { outcome: "not_found" };
  if (row.billing === "subscription") return { outcome: "subscription" };
  if (row.provider !== "apify") return { outcome: "unsupported_provider" };
  if (!row.external_run_id) return { outcome: "no_external_run" };
  if (row.usage_settled_at !== null) return { outcome: "already_reconciled", actualUsd: row.actual_usd ?? undefined };

  const apifyRun = await getRun(row.external_run_id);
  if (!isTerminalRunStatus(apifyRun.status)) return { outcome: "not_finished", apifyStatus: apifyRun.status };
  const usage = apifyRun.usageTotalUsd;
  if (!isUsableUsd(usage) || usage === 0) return { outcome: "usage_unavailable" };

  const now = deps.now ?? new Date();
  const reading = roundUsd(usage);
  const previous = row.actual_usd ?? undefined; // bir önceki (geçici) okuma
  const actualUsd = previous === undefined ? reading : Math.max(previous, reading);
  const finishedMs = Date.parse(apifyRun.finishedAt ?? row.finished_at ?? "");
  const ageMs = Number.isNaN(finishedMs) ? 0 : now.getTime() - finishedMs;
  // "İki ardışık okumada değer sabit" = bu okuma bir öncekiyle AYNI (düşük okuma sabit sayılmaz: Apify kullanımı azalmaz, bu bir aksaklıktır).
  const steady = previous !== undefined && reading === previous;
  const client = deps.client ?? getAdminClient();

  if (!steady || ageMs < SETTLE_MIN_AGE_MS) {
    // Geçici: yalnız yukarı yazılır (aynı/düşük okumada yazılacak bir şey yok).
    if (previous === undefined || reading > previous) {
      const updated = await updateRun(client, runId, { actual_usd: actualUsd }, { withoutSettled: true });
      if (!updated) return { outcome: "already_reconciled" }; // başka süreç bu arada kesinleştirdi
    }
    return { outcome: "provisional", actualUsd, reason: previous === undefined ? "first_read" : steady ? "too_young" : "changed" };
  }

  const reservedUsd = Math.min(row.reserved_usd, actualUsd);
  const updated = await updateRun(
    client,
    runId,
    { actual_usd: actualUsd, reserved_usd: reservedUsd, usage_settled_at: now.toISOString() },
    { withoutSettled: true },
  );
  if (!updated) return { outcome: "already_reconciled" };
  return { outcome: "reconciled", actualUsd, reservedUsd };
}

export interface ReconcileSummary {
  checked: number;
  /** Bu turda KESİNLEŞEN koşu sayısı. */
  reconciled: number;
  /** Henüz kesinleşmedi (geçici/bitmedi/kullanım görünmüyor): sonraki turda tekrar denenir. */
  pending: number;
  /** Apify okuması başarısız oldu (geçici); koşu listede kalır. */
  errors: number;
}

export interface ReconcileOpenOptions {
  workspaceId?: string;
  limit?: number;
  /** Bu kadar günden eski koşulara bakılmaz (Apify kullanımı dakikalar içinde işlenir). */
  sinceDays?: number;
}

/**
 * Mutabakat listesi: Apify'a gitmiş, kullanımı henüz KESİNLEŞMEMİŞ (`usage_settled_at` NULL) ücretli koşular (en yeni önce).
 * Geçici `actual_usd`'si olanlar da listededir (ikinci okumayla kesinleşir); abonelik koşuları (`billing = 'subscription'`) hariçtir.
 */
export async function reconcileOpenRuns(
  options: ReconcileOpenOptions = {},
  deps: BudgetDeps = {},
): Promise<ReconcileSummary> {
  const client = deps.client ?? getAdminClient();
  const now = deps.now ?? new Date();
  const since = new Date(now.getTime() - (options.sinceDays ?? RECONCILE_DEFAULT_SINCE_DAYS) * 86_400_000);

  let query = client
    .from("collection_runs")
    .select("id")
    .eq("provider", "apify")
    .eq("billing", "metered")
    .is("usage_settled_at", null)
    .not("external_run_id", "is", null)
    .gte("started_at", since.toISOString());
  if (options.workspaceId) query = query.eq("workspace_id", options.workspaceId);
  const { data, error } = await query
    .order("started_at", { ascending: false })
    .limit(options.limit ?? RECONCILE_DEFAULT_LIMIT);
  if (error) throw storeError("listeleme", error.message);

  const summary: ReconcileSummary = { checked: 0, reconciled: 0, pending: 0, errors: 0 };
  for (const { id } of data ?? []) {
    summary.checked += 1;
    try {
      const result = await reconcileRun(id, deps);
      if (result.outcome === "reconciled") summary.reconciled += 1;
      else if (isReconcilePending(result)) summary.pending += 1;
    } catch (caught) {
      if (caught instanceof ApifyConfigError) throw caught;
      summary.errors += 1;
    }
  }
  return summary;
}
