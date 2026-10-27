/**
 * Apify REST istemcisi — "hangi aktörün ne yaptığını bilmez": verilen aktörü verilen girdiyle başlatır, koşuyu
 * sorgular/iptal eder, dataset'i okur. Platform anlamı `lib/platforms/**`'tedir. Port kaynağı: `rakip analiz\src\kaynaklar\apify.ts`.
 *
 * Kaynaktan farklar:
 *  - Token URL'de DEĞİL, `Authorization: Bearer` başlığında gider (URL günlüklere/hata iletilerine düşer). Hata iletisi
 *    yalnız yol (sorgu dizesiz), durum kodu ve kısaltılmış yanıt gövdesini taşır; token değeri hiçbir yerde yer almaz.
 *  - Sunucu yolunda BLOKLAYAN bekleme yok: koşu başlatılır, id kaydedilir, sonucu webhook + cron başına tek `getRun`
 *    çağrısı ilerletir. Bloklayan bekleme yalnız yerel script/test içindir: `wait-for-run.ts`.
 *  - Aktör kimliği `sahip/ad` → `sahip~ad` yazılır (Apify'ın belgelediği biçim; `%2F` yönlendiriciye bağlı davranır).
 *  - Her istek 30 sn'de zaman aşımına uğrar (sunucu isteği asılı kalmaz).
 *
 * Gizli değer: `APIFY_TOKEN` (yalnız `process.env`'den, çağrı anında okunur).
 */
import "server-only";
import { z } from "zod";

const API_BASE = "https://api.apify.com/v2";
const DEFAULT_TIMEOUT_MS = 30_000;
const RETRY_DELAY_MS = 5_000;

/** Yapılandırma eksik (token yok): çağıran bunu kullanıcıya "Apify bağlı değil" diye çevirir; yeniden denenmez. */
export class ApifyConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApifyConfigError";
  }
}

/** Apify HTTP hatası. `path` sorgu dizesizdir (webhook parametresi sır taşıyabilir); token asla iletide yoktur. */
export class ApifyApiError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
    detail?: string,
  ) {
    super(`Apify API ${status} — ${path}${detail ? `: ${detail}` : ""}`);
    this.name = "ApifyApiError";
  }
}

/** 429 (hız sınırı) ve 5xx geçicidir; 4xx (yanlış girdi, yetki) tekrar denemekle düzelmez. */
export function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 429/5xx'te bir kez 5 sn sonra tekrar (kaynak `yenidenDenemeliCagir`). Yalnız `ApifyApiError` yeniden denenir;
 * ağ hatası/yapılandırma hatası olduğu gibi yükselir.
 */
export async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (!(error instanceof ApifyApiError) || !isRetryableStatus(error.status)) throw error;
    await sleep(RETRY_DELAY_MS);
    return fn();
  }
}

function readToken(): string {
  const token = process.env.APIFY_TOKEN?.trim();
  if (!token) {
    throw new ApifyConfigError("APIFY_TOKEN tanımlı değil (.env.local / ortam değişkeni); Apify çağrısı yapılamadı.");
  }
  return token;
}

/** İletiye düşecek metinden token'ı siler (savunma: Apify yanıtı isteği yansıtırsa). */
function scrub(text: string, token: string): string {
  return token ? text.split(token).join("***") : text;
}

interface RequestOptions {
  method?: "GET" | "POST";
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  timeoutMs?: number;
}

async function apifyRequest(path: string, options: RequestOptions = {}): Promise<unknown> {
  return withRetry(async () => {
    const token = readToken();
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) params.set(key, String(value));
    }
    const queryString = params.toString();
    const url = `${API_BASE}${path}${queryString ? `?${queryString}` : ""}`;
    const hasBody = options.body !== undefined;

    const response = await fetch(url, {
      method: options.method ?? "GET",
      headers: {
        authorization: `Bearer ${token}`,
        ...(hasBody ? { "content-type": "application/json" } : {}),
      },
      body: hasBody ? JSON.stringify(options.body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new ApifyApiError(response.status, path, scrub(detail, token).slice(0, 300) || undefined);
    }
    try {
      return await response.json();
    } catch {
      throw new ApifyApiError(response.status, path, "yanıt JSON değil");
    }
  });
}

/** `apify/instagram-scraper` → `apify~instagram-scraper` (Apify'ın belgelediği yol biçimi). */
export function actorPathId(actorId: string): string {
  const id = actorId.trim();
  if (!id) throw new RangeError("Aktör kimliği boş olamaz.");
  return encodeURIComponent(id.replace("/", "~"));
}

// ── Yanıt şemaları (beklenmeyen şekil sessizce yutulmaz) ─────────────────────

const runDataSchema = z.object({
  id: z.string().min(1),
  status: z.string(),
  defaultDatasetId: z.string().min(1).nullish(),
  usageTotalUsd: z.number().nullish(),
  startedAt: z.string().nullish(),
  finishedAt: z.string().nullish(),
});
const runResponseSchema = z.object({ data: runDataSchema });
const actorResponseSchema = z.object({
  data: z.object({ id: z.string(), pricingInfos: z.array(z.unknown()).nullish() }),
});

function parseResponse<T>(schema: z.ZodType<T>, raw: unknown, path: string): T {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new ApifyApiError(200, path, "beklenmeyen yanıt şekli");
  return parsed.data;
}

// ── Genel arayüz ─────────────────────────────────────────────────────────────

/**
 * Ad hoc webhook tanımı (`POST /acts/{id}/runs?webhooks=<base64 JSON dizi>`). Kurucu: `webhook.ts` `buildRunWebhooks`.
 * `headersTemplate` JSON nesnesi biçiminde bir DİZGEDİR (Apify şablonu).
 */
export interface ApifyWebhookSpec {
  eventTypes: string[];
  requestUrl: string;
  headersTemplate?: string;
  payloadTemplate?: string;
  idempotencyKey?: string;
}

export interface StartRunOptions {
  webhooks?: ApifyWebhookSpec[];
}

export interface StartedRun {
  runId: string;
  datasetId: string;
  status: string;
}

/** Aktörü başlatır (PARA HARCAR: çağrıdan önce `budget.ts` ile rezerve et; bkz. `start.ts`). Beklemez. */
export async function startRun(
  actorId: string,
  input: unknown,
  options: StartRunOptions = {},
): Promise<StartedRun> {
  const path = `/acts/${actorPathId(actorId)}/runs`;
  const webhooks = options.webhooks?.length
    ? Buffer.from(JSON.stringify(options.webhooks), "utf8").toString("base64")
    : undefined;
  const raw = await apifyRequest(path, { method: "POST", body: input ?? {}, query: { webhooks } });
  const { data } = parseResponse(runResponseSchema, raw, path);
  if (!data.defaultDatasetId) throw new ApifyApiError(200, path, "yanıtta defaultDatasetId yok");
  return { runId: data.id, datasetId: data.defaultDatasetId, status: data.status };
}

export interface RunSnapshot {
  runId: string;
  /** Apify durumu (`ApifyRunStatus`; bilinmeyen değer olduğu gibi gelir). */
  status: string;
  datasetId?: string;
  /**
   * Apify'ın bildirdiği toplam kullanım (USD). Bildirilmediyse alan YOK (0 değil). Koşu bittikten ~30 sn sonra
   * işlenir; o zamana kadar 0/yok gelir (kaynak notu: bitişten 28 sn sonra $0,0027 göründü).
   */
  usageTotalUsd?: number;
  startedAt?: string;
  finishedAt?: string;
}

export async function getRun(runId: string): Promise<RunSnapshot> {
  const path = `/actor-runs/${encodeURIComponent(runId)}`;
  const { data } = parseResponse(runResponseSchema, await apifyRequest(path), path);
  return {
    runId: data.id,
    status: data.status,
    datasetId: data.defaultDatasetId ?? undefined,
    usageTotalUsd: typeof data.usageTotalUsd === "number" && Number.isFinite(data.usageTotalUsd) ? data.usageTotalUsd : undefined,
    startedAt: data.startedAt ?? undefined,
    finishedAt: data.finishedAt ?? undefined,
  };
}

/** Koşuyu iptal eder. Bitmiş koşuda Apify 4xx döner (`ApifyApiError`); çağıran karar verir. */
export async function abortRun(runId: string): Promise<void> {
  await apifyRequest(`/actor-runs/${encodeURIComponent(runId)}/abort`, { method: "POST" });
}

export interface DatasetPage {
  offset?: number;
  limit?: number;
}

/** Dataset öğeleri (ham; normalize `lib/platforms/**`'tedir). Yanıt düz dizidir. */
export async function getDatasetItems<T = unknown>(datasetId: string, page: DatasetPage = {}): Promise<T[]> {
  const path = `/datasets/${encodeURIComponent(datasetId)}/items`;
  const raw = await apifyRequest(path, {
    query: { format: "json", offset: page.offset, limit: page.limit },
    timeoutMs: 60_000,
  });
  if (!Array.isArray(raw)) throw new ApifyApiError(200, path, "dataset yanıtı dizi değil");
  return raw as T[];
}

export interface ActorInfo {
  id: string;
  /** Ham fiyat kayıtları (en yenisi sonda); okuma `pricing.ts`'te. */
  pricingInfos: unknown[];
}

export async function getActor(actorId: string): Promise<ActorInfo> {
  const path = `/acts/${actorPathId(actorId)}`;
  const { data } = parseResponse(actorResponseSchema, await apifyRequest(path), path);
  return { id: data.id, pricingInfos: data.pricingInfos ?? [] };
}
