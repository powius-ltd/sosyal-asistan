/**
 * Apify webhook: kurma (koşu başlatılırken) ve doğrulama (webhook gelince).
 *
 * Kimlik doğrulama: Apify'ın webhook isteği herkese açık bir URL'ye gelir; kimliği paylaşılan gizli başlıktır
 * (`x-sosyal-webhook-secret` = env `APIFY_WEBHOOK_SECRET`). Başlık, koşu başlatılırken webhook tanımının
 * `headersTemplate`'ine yazılır (`buildRunWebhooks`). Karşılaştırma sabit zamanlıdır; gizli yapılandırılmamışsa
 * HİÇBİR istek kabul edilmez (kapalı kapı). Gizli değer loglanmaz, iletiye girmez.
 *
 * Not: ad hoc webhook'lar Apify'a `POST /acts/{id}/runs?webhooks=<base64>` sorgusuyla gider; gizli değer bu tanımın
 * içinde Apify'a TLS ile iletilir (Apify tarafı sorgu günlüğü riski). Şüphede `APIFY_WEBHOOK_SECRET` döndürülür.
 */
import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { ApifyWebhookSpec } from "@/lib/apify/client";
import { toCollectionRunStatus } from "@/lib/apify/status";
import { isUsableUsd } from "@/lib/apify/usd";
import type { RunStatus } from "@/lib/domain/run";

export const WEBHOOK_SECRET_HEADER = "x-sosyal-webhook-secret";

/** Kısa gizli deneme-yanılmaya açıktır: daha kısası yapılandırılmamış sayılır. */
export const WEBHOOK_SECRET_MIN_LENGTH = 16;

const MAX_BODY_CHARS = 1_000_000;

/** Bitiş olayları (Apify olay adı alt çizgiyle: `TIMED_OUT`; koşu durumu tireyle: `TIMED-OUT`). */
export const RUN_WEBHOOK_EVENT_TYPES = [
  "ACTOR.RUN.SUCCEEDED",
  "ACTOR.RUN.FAILED",
  "ACTOR.RUN.ABORTED",
  "ACTOR.RUN.TIMED_OUT",
] as const;

const STATUS_BY_EVENT: Readonly<Record<string, string>> = {
  "ACTOR.RUN.SUCCEEDED": "SUCCEEDED",
  "ACTOR.RUN.FAILED": "FAILED",
  "ACTOR.RUN.ABORTED": "ABORTED",
  "ACTOR.RUN.TIMED_OUT": "TIMED-OUT",
};

function configuredSecret(explicit?: string): string | undefined {
  const secret = (explicit ?? process.env.APIFY_WEBHOOK_SECRET)?.trim();
  return secret && secret.length >= WEBHOOK_SECRET_MIN_LENGTH ? secret : undefined;
}

/** Koşu başlatırken verilecek webhook tanımı (`startRun(..., { webhooks })`). `requestUrl` herkese açık HTTPS olmalı. */
export function buildRunWebhooks(options: { requestUrl: string; secret?: string }): ApifyWebhookSpec[] {
  const secret = configuredSecret(options.secret);
  if (!secret) {
    throw new Error(
      `APIFY_WEBHOOK_SECRET tanımlı değil ya da ${WEBHOOK_SECRET_MIN_LENGTH} karakterden kısa; webhook kurulamadı.`,
    );
  }
  let url: URL;
  try {
    url = new URL(options.requestUrl);
  } catch {
    throw new Error("Webhook adresi geçerli bir URL değil.");
  }
  if (url.protocol !== "https:") throw new Error("Webhook adresi https olmalı (Apify herkese açık HTTPS'e çağırır).");
  return [
    {
      eventTypes: [...RUN_WEBHOOK_EVENT_TYPES],
      requestUrl: url.toString(),
      headersTemplate: JSON.stringify({ [WEBHOOK_SECRET_HEADER]: secret }),
    },
  ];
}

/**
 * Paylaşılan gizli başlığı sabit zamanlı doğrular. İki değer de SHA-256'ya çekilip eşit uzunlukta karşılaştırılır
 * (uzunluk bilgisi sızmaz). Gizli yapılandırılmamışsa her zaman `false`.
 */
export function verifyWebhookSecret(provided: string | null | undefined, expectedSecret?: string): boolean {
  const expected = configuredSecret(expectedSecret);
  if (!expected || !provided) return false;
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

// Apify varsayılan yükü: { eventType, eventData: { actorId, actorRunId }, resource: <koşu nesnesi> }.
const payloadSchema = z.object({
  eventType: z.string().min(1),
  eventData: z.object({ actorId: z.string().nullish(), actorRunId: z.string().min(1).nullish() }).nullish(),
  resource: z
    .object({
      id: z.string().min(1).nullish(),
      status: z.string().nullish(),
      defaultDatasetId: z.string().nullish(),
      usageTotalUsd: z.number().nullish(),
    })
    .nullish(),
});

export interface ApifyWebhookEvent {
  /** Apify koşu kimliği (`collection_runs.external_run_id`). */
  runId: string;
  eventType: string;
  /** Apify durumu (`SUCCEEDED`, `TIMED-OUT` …); olaydan, yoksa `resource.status`'tan. */
  status?: string;
  /** Bizim durum karşılığı; yalnız bitmiş koşularda dolu. */
  runStatus?: RunStatus;
  datasetId?: string;
  /** Yükte varsa (çoğu zaman 0/yok: ücret gecikmeli işlenir) — 0 gerçek tutar sayılmaz, mutabakat `getRun` ile yapılır. */
  usageTotalUsd?: number;
}

export type WebhookRejection = "not_configured" | "unauthorized" | "invalid_payload";

export type WebhookParseResult = { ok: true; event: ApifyWebhookEvent } | { ok: false; reason: WebhookRejection };

/** Doğrulanmış gövdeyi (JSON) olay nesnesine çevirir; koşu kimliği yoksa `undefined`. */
export function parseWebhookPayload(body: unknown): ApifyWebhookEvent | undefined {
  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) return undefined;
  const { eventType, eventData, resource } = parsed.data;
  const runId = eventData?.actorRunId ?? resource?.id;
  if (!runId) return undefined;
  const status = STATUS_BY_EVENT[eventType] ?? resource?.status ?? undefined;
  const usage = resource?.usageTotalUsd;
  return {
    runId,
    eventType,
    status,
    runStatus: toCollectionRunStatus(status),
    datasetId: resource?.defaultDatasetId ?? undefined,
    usageTotalUsd: isUsableUsd(usage) ? usage : undefined,
  };
}

/**
 * Webhook isteğini doğrular ve ayrıştırır. Sıra: gizli yapılandırma → başlık → gövde (gövde YETKİSİZ istekte hiç
 * okunmaz). Rota işleyicisi: `not_configured` → 500, `unauthorized` → 401, `invalid_payload` → 400.
 */
export async function parseApifyWebhook(request: Request): Promise<WebhookParseResult> {
  if (!configuredSecret()) return { ok: false, reason: "not_configured" };
  if (!verifyWebhookSecret(request.headers.get(WEBHOOK_SECRET_HEADER))) return { ok: false, reason: "unauthorized" };

  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_CHARS) return { ok: false, reason: "invalid_payload" };
    body = JSON.parse(text);
  } catch {
    return { ok: false, reason: "invalid_payload" };
  }
  const event = parseWebhookPayload(body);
  return event ? { ok: true, event } : { ok: false, reason: "invalid_payload" };
}
