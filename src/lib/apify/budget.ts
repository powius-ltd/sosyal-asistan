/**
 * Bütçe rezervasyonu (paralı çağrıdan ÖNCE) ve koşu yaşam döngüsü. Port kaynağı: `rakip analiz\src\mcp\reels.ts`
 * (tavan rezervasyonu/mutabakat) — bellekteki sayaç yerine DB: `reserve_budget` RPC + `collection_runs` satırları.
 *
 * Neden önden rezervasyon: Apify `usageTotalUsd` koşu bittiği anda 0'dır, ücret ~30 sn sonra işlenir; harcamayı koşu
 * SONRASINDA saymak tavanı işlevsiz bırakır. Bu yüzden beklenen tutar başlamadan tutulur (tavan aşılırsa koşu HİÇ
 * başlamaz) ve gerçek tutar sonradan `reconcileRun` (`reconcile.ts`) ile yazılır.
 *
 * Kurallar:
 *  - `actual_usd` NULL = mutabakat yok (0 DEĞİL). Apify kullanımı okunamazsa/0 ise hiçbir şey yazılmaz, koşu
 *    mutabakat listesinde (`reconcileOpenRuns`) kalır.
 *  - Apify kullanımı koşu bittikten sonra KADEMELİ işlenir (gerçek koşuda ilk okuma nihai tutarın %4–90'ıydı). Bu yüzden
 *    `actual_usd` iki aşamada yazılır: önce GEÇİCİ (yalnız yukarı; ay toplamı `greatest` ile zaten alt sınır sayar), ardından
 *    KESİNLEŞİR — yalnız koşu bitiminden ≥ `SETTLE_MIN_AGE_MS` (60 sn) geçtiyse VE iki ardışık okumada değer sabitse
 *    (`usage_settled_at` damgası atılır). Mutabakatın TEK doğru yeri burasıdır (`reconcileRun`); çağıranlar (toplama turu,
 *    cron) yalnız onu tekrar çağırır, kendi bekleme/oturma mantığı yazmaz. Mutabakat `reconcile.ts`'tedir; bu dosya rezervasyon + koşu
 *    yaşam döngüsüdür.
 *  - Ay toplamı Σ greatest(actual, reserved): gerçek tutar rezerveyi aşarsa o sayılır; boşa çıkan rezerveyi serbest
 *    bırakmak için `reserved_usd` YALNIZ kesinleşince gerçek tutara indirilir (geçici tutarda rezerve aynen kalır).
 *  - Abonelik koşuları (`billing = 'subscription'`: agy/Claude CLI) tutarsızdır: rezerve 0, `actual_usd` NULL kalır ve
 *    mutabakat listesine girmez.
 *  - Rezervasyon yalnız Apify'a hiç gitmemiş koşuda sıfırlanır (`releaseReservation`): parası harcanmış olabilecek
 *    koşunun tutarı asla düşürülmez.
 *
 * Yalnız service role (`getAdminClient`); çağıran workspace yetkisini kendisi doğrular.
 */
import "server-only";
import { roundUsd } from "@/lib/apify/usd";
import type { RunBilling, RunPurpose } from "@/lib/domain/run";
import { formatUsd } from "@/lib/format";
import { currentPanelJobId } from "@/lib/job-scope";
import { getAdminClient, type AdminClient } from "@/lib/supabase/admin";
import type { Database, Json } from "@/lib/supabase/database.types";

export type CollectionRunRow = Database["public"]["Tables"]["collection_runs"]["Row"];

/** `reserve_budget` RPC'nin bildiği sağlayıcılar (`collection_runs.provider` check'i ile aynı). */
export type BudgetProvider = "apify" | "anthropic" | "openai" | "deepgram" | "gemini" | "claude_cli" | "graph_api";

export interface BudgetDeps {
  /** Test/özel kullanım için; yoksa süreç boyunca tek service role istemcisi. */
  client?: AdminClient;
  /** Tek saat (finished_at, pencere hesapları). */
  now?: Date;
}

const ERROR_MAX_CHARS = 500;

/** Tavan aşılacağı için koşu başlatılmadı. `spent`/`cap` DB ayrıntısından okunamazsa `undefined` (0 değil). */
export class BudgetExceededError extends Error {
  constructor(
    /** Bu çağrı için istenen tutar (USD). */
    readonly amount: number,
    /** Ay içinde tavana sayılan (greatest(actual, reserved) toplamı) tutar. */
    readonly spent: number | undefined,
    /** Aylık tavan. */
    readonly cap: number | undefined,
  ) {
    super(
      `Aylık bütçe tavanı aşılacağı için koşu başlatılmadı: istenen ${formatUsd(amount) ?? "?"}, ` +
        `bu ay tutulan ${formatUsd(spent) ?? "bilinmiyor"}, tavan ${formatUsd(cap) ?? "bilinmiyor"}.`,
    );
    this.name = "BudgetExceededError";
  }
}

/** `reserve_budget`'in hata ayrıntısı: `cap=10.000000 committed=9.500000 requested=1.000000`. */
function parseBudgetDetail(details: string | null | undefined): { spent?: number; cap?: number } {
  const read = (key: string): number | undefined => {
    const match = details?.match(new RegExp(`${key}=(-?\\d+(?:\\.\\d+)?)`));
    const value = match ? Number(match[1]) : undefined;
    return value !== undefined && Number.isFinite(value) ? value : undefined;
  };
  return { spent: read("committed"), cap: read("cap") };
}

function truncateError(message: string | undefined): string | null {
  return message ? message.slice(0, ERROR_MAX_CHARS) : null;
}

export function storeError(action: string, message: string): Error {
  return new Error(`Koşu kaydı ${action} başarısız: ${message}`);
}

export interface RunDraft {
  /** Domain `RunKind` (`profile`, `content`, `discovery_search`, …). */
  kind: string;
  targetLabel?: string;
  expectedResults?: number;
  priceUnknown?: boolean;
  /**
   * Faturalama biçimi: verilmezse `metered` (kullanıma göre ücretli). Abonelik çağrıları (agy/Gemini CLI, Claude CLI) `subscription`
   * ile 0 USD rezerve eder; yalnız `gemini`/`claude_cli` sağlayıcısı olabilir (DB kısıtı). `actual_usd` NULL kalır, mutabakata girmez.
   */
  billing?: RunBilling;
  /** Koşunun amacı: `measurement` = Reels ölçümü (aylık ölçüm tavanına sayılır; tavanı çağıran denetler, bkz. `measure:now`). */
  purpose?: RunPurpose;
}

/**
 * Paralı çağrıdan ÖNCE tutar rezerve eder ve `reserved` durumunda bir `collection_runs` satırı açar. Tavan aşılırsa
 * `BudgetExceededError` fırlatır ve HİÇBİR satır açılmaz (sağlayıcı çağrısı yapılmamalıdır).
 */
export async function reserveBudget(
  workspaceId: string,
  provider: BudgetProvider,
  amountUsd: number,
  run: RunDraft,
  deps: BudgetDeps = {},
): Promise<CollectionRunRow> {
  if (!Number.isFinite(amountUsd) || amountUsd < 0) {
    throw new RangeError("Rezerve edilecek tutar sonlu ve negatif olmayan bir sayı olmalı.");
  }
  const amount = roundUsd(amountUsd);
  const payload: { [key: string]: Json | undefined } = {
    kind: run.kind,
    target_label: run.targetLabel,
    expected_results: run.expectedResults,
    price_unknown: run.priceUnknown,
    billing: run.billing,
    purpose: run.purpose,
    // Panel işçisinin koşturduğu işte koşu o işe bağlanır (`lib/job-scope.ts`); iş kapsamı dışında alan gitmez (sütun NULL kalır).
    panel_job_id: currentPanelJobId(),
  };

  const client = deps.client ?? getAdminClient();
  const { data, error } = await client.rpc("reserve_budget", {
    p_ws: workspaceId,
    p_provider: provider,
    p_amount: amount,
    p_run: payload,
  });

  if (error) {
    if (/budget_exceeded/.test(error.message)) {
      const { spent, cap } = parseBudgetDetail(error.details);
      throw new BudgetExceededError(amount, spent, cap);
    }
    throw storeError("rezervasyonu", error.message);
  }
  if (!data || typeof data.id !== "string") throw storeError("rezervasyonu", "RPC satır döndürmedi");
  return data;
}

export interface UpdateFilter {
  /** Yalnız bu durumlardaki satır güncellenir (durum geriye/yanlış yöne gitmez). */
  statuses?: string[];
  /** true: yalnız Apify'a hiç gitmemiş (external_run_id NULL) satır. */
  withoutExternalId?: boolean;
  /** true: yalnız kullanımı henüz KESİNLEŞMEMİŞ (usage_settled_at NULL) satır: kesinleşmiş tutar bir daha değişmez. */
  withoutSettled?: boolean;
}

/** Koşu satırını koşullu günceller; koşula uyan satır yoksa `undefined` (güncelleme uygulanmadı). */
export async function updateRun(
  client: AdminClient,
  runId: string,
  patch: Database["public"]["Tables"]["collection_runs"]["Update"],
  filter: UpdateFilter = {},
): Promise<CollectionRunRow | undefined> {
  let query = client.from("collection_runs").update(patch).eq("id", runId);
  if (filter.statuses) query = query.in("status", filter.statuses);
  if (filter.withoutExternalId) query = query.is("external_run_id", null);
  if (filter.withoutSettled) query = query.is("usage_settled_at", null);
  const { data, error } = await query.select().maybeSingle();
  if (error) throw storeError("güncelleme", error.message);
  return data ?? undefined;
}

export async function getRunRow(runId: string, deps: BudgetDeps = {}): Promise<CollectionRunRow | undefined> {
  const client = deps.client ?? getAdminClient();
  const { data, error } = await client.from("collection_runs").select("*").eq("id", runId).maybeSingle();
  if (error) throw storeError("okuma", error.message);
  return data ?? undefined;
}

/** Webhook/poll için: Apify koşu kimliğinden bizim satırı bulur (`(provider, external_run_id)` benzersizdir). */
export async function findRunByExternalId(
  externalRunId: string,
  deps: BudgetDeps = {},
): Promise<CollectionRunRow | undefined> {
  const client = deps.client ?? getAdminClient();
  const { data, error } = await client
    .from("collection_runs")
    .select("*")
    .eq("provider", "apify")
    .eq("external_run_id", externalRunId)
    .maybeSingle();
  if (error) throw storeError("okuma", error.message);
  return data ?? undefined;
}

/** `finished_at >= started_at` check'i: uygulama saati DB saatinden geride olsa bile ihlal etmez. */
async function finishedAtFor(client: AdminClient, runId: string, now: Date): Promise<string | undefined> {
  const { data, error } = await client.from("collection_runs").select("started_at").eq("id", runId).maybeSingle();
  if (error) throw storeError("okuma", error.message);
  if (!data) return undefined;
  const started = new Date(data.started_at);
  return (Number.isNaN(started.getTime()) || now >= started ? now : started).toISOString();
}

/** Apify koşusu başladı: sağlayıcı kimliklerini yazar, `reserved` → `running`. Satır `reserved` değilse `false`. */
export async function markRunStarted(
  runId: string,
  ids: { externalRunId: string; datasetId: string },
  deps: BudgetDeps = {},
): Promise<boolean> {
  const client = deps.client ?? getAdminClient();
  const row = await updateRun(
    client,
    runId,
    { status: "running", external_run_id: ids.externalRunId, dataset_id: ids.datasetId },
    { statuses: ["reserved"] },
  );
  return row !== undefined;
}

export interface RunOutcome {
  /** `ingested`: veri DB'ye yazıldı (S2 ingest adımı). Diğerleri sağlayıcı sonucudur. */
  status: "succeeded" | "ingested" | "failed" | "aborted" | "timed_out";
  error?: string;
  itemCount?: number;
}

/**
 * Koşuyu bitirir. Durum yalnız ileri gider: `reserved/running` → sonuç; `succeeded` → `ingested`. Bitmiş satır
 * (ör. webhook'un ikinci teslimi) değişmez ve `false` döner — idempotenttir.
 */
export async function markRunFinished(runId: string, outcome: RunOutcome, deps: BudgetDeps = {}): Promise<boolean> {
  const client = deps.client ?? getAdminClient();
  const isIngest = outcome.status === "ingested";
  const patch: Database["public"]["Tables"]["collection_runs"]["Update"] = { status: outcome.status };
  if (outcome.error !== undefined) patch.error = truncateError(outcome.error);
  if (outcome.itemCount !== undefined) patch.item_count = outcome.itemCount;
  if (!isIngest) {
    const finishedAt = await finishedAtFor(client, runId, deps.now ?? new Date());
    if (!finishedAt) return false;
    patch.finished_at = finishedAt;
  }
  const row = await updateRun(client, runId, patch, {
    statuses: isIngest ? ["reserved", "running", "succeeded"] : ["reserved", "running"],
  });
  return row !== undefined;
}

/**
 * Başlatma başarısız oldu (Apify'a koşu gitmedi): rezervasyon 0'a çekilir, durum `failed`. Yalnız `reserved` ve
 * `external_run_id`'si boş satırda çalışır — çalışan/parası harcanmış koşunun tutarı bu yoldan düşürülemez.
 */
export async function releaseReservation(runId: string, reason: string, deps: BudgetDeps = {}): Promise<boolean> {
  const client = deps.client ?? getAdminClient();
  const finishedAt = await finishedAtFor(client, runId, deps.now ?? new Date());
  if (!finishedAt) return false;
  const row = await updateRun(
    client,
    runId,
    { reserved_usd: 0, status: "failed", error: truncateError(reason), finished_at: finishedAt },
    { statuses: ["reserved"], withoutExternalId: true },
  );
  return row !== undefined;
}
