import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildRunWebhooks,
  parseApifyWebhook,
  parseWebhookPayload,
  RUN_WEBHOOK_EVENT_TYPES,
  verifyWebhookSecret,
  WEBHOOK_SECRET_HEADER,
} from "@/lib/apify/webhook";

// Sahte gizli (gerçek değil).
const SECRET = "test-webhook-secret-not-real-0123456789";

const succeededPayload = {
  userId: "u1",
  createdAt: "2026-09-30T08:00:00.000Z",
  eventType: "ACTOR.RUN.SUCCEEDED",
  eventData: { actorId: "actor1", actorRunId: "run123" },
  resource: { id: "run123", status: "SUCCEEDED", defaultDatasetId: "ds1", usageTotalUsd: 0 },
};

function webhookRequest(options: { secret?: string | null; body?: unknown; rawBody?: string } = {}): Request {
  const headers = new Headers({ "content-type": "application/json" });
  if (options.secret !== null) headers.set(WEBHOOK_SECRET_HEADER, options.secret ?? SECRET);
  return new Request("https://panel.example.test/api/webhooks/apify", {
    method: "POST",
    headers,
    body: options.rawBody ?? JSON.stringify(options.body ?? succeededPayload),
  });
}

describe("webhook imzası (paylaşılan gizli başlık)", () => {
  beforeEach(() => {
    vi.stubEnv("APIFY_WEBHOOK_SECRET", SECRET);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("doğru gizli → kabul; olay runId/durum/dataset ile çıkar", async () => {
    const result = await parseApifyWebhook(webhookRequest());
    expect(result).toEqual({
      ok: true,
      event: {
        runId: "run123",
        eventType: "ACTOR.RUN.SUCCEEDED",
        status: "SUCCEEDED",
        runStatus: "succeeded",
        datasetId: "ds1",
        usageTotalUsd: 0,
      },
    });
  });

  it("yanlış gizli → unauthorized", async () => {
    expect(await parseApifyWebhook(webhookRequest({ secret: `${SECRET}x` }))).toEqual({ ok: false, reason: "unauthorized" });
    expect(await parseApifyWebhook(webhookRequest({ secret: "yanlis" }))).toEqual({ ok: false, reason: "unauthorized" });
  });

  it("başlık yok / boş → unauthorized", async () => {
    expect(await parseApifyWebhook(webhookRequest({ secret: null }))).toEqual({ ok: false, reason: "unauthorized" });
    expect(await parseApifyWebhook(webhookRequest({ secret: "" }))).toEqual({ ok: false, reason: "unauthorized" });
  });

  it("yetkisiz istekte gövde hiç okunmaz", async () => {
    const request = webhookRequest({ secret: "yanlis" });
    const textSpy = vi.spyOn(request, "text");
    await parseApifyWebhook(request);
    expect(textSpy).not.toHaveBeenCalled();
  });

  it("gizli yapılandırılmamış ya da çok kısaysa HİÇBİR istek kabul edilmez (kapalı kapı)", async () => {
    vi.stubEnv("APIFY_WEBHOOK_SECRET", "");
    expect(await parseApifyWebhook(webhookRequest({ secret: "" }))).toEqual({ ok: false, reason: "not_configured" });
    expect(await parseApifyWebhook(webhookRequest({ secret: SECRET }))).toEqual({ ok: false, reason: "not_configured" });

    vi.stubEnv("APIFY_WEBHOOK_SECRET", "kisa");
    expect(await parseApifyWebhook(webhookRequest({ secret: "kisa" }))).toEqual({ ok: false, reason: "not_configured" });
  });

  it("verifyWebhookSecret: eşit uzunlukta yanlış değer ve farklı uzunluklu değer reddedilir, hata fırlatmaz", () => {
    expect(verifyWebhookSecret(SECRET)).toBe(true);
    expect(verifyWebhookSecret(SECRET.replace(/.$/, "!"))).toBe(false);
    expect(verifyWebhookSecret(SECRET.slice(0, -1))).toBe(false);
    expect(verifyWebhookSecret(`${SECRET}${SECRET}`)).toBe(false);
    expect(verifyWebhookSecret(undefined)).toBe(false);
    expect(verifyWebhookSecret(null)).toBe(false);
    expect(verifyWebhookSecret(SECRET, "baska-bir-gizli-deger-32-karakter!")).toBe(false);
  });

  it("geçerli imza + bozuk gövde → invalid_payload", async () => {
    expect(await parseApifyWebhook(webhookRequest({ rawBody: "{bozuk" }))).toEqual({ ok: false, reason: "invalid_payload" });
    expect(await parseApifyWebhook(webhookRequest({ body: { eventType: "ACTOR.RUN.SUCCEEDED" } }))).toEqual({
      ok: false,
      reason: "invalid_payload",
    });
    expect(await parseApifyWebhook(webhookRequest({ body: [1, 2] }))).toEqual({ ok: false, reason: "invalid_payload" });
  });
});

describe("parseWebhookPayload", () => {
  it("koşu kimliği eventData.actorRunId'den, yoksa resource.id'den gelir", () => {
    expect(parseWebhookPayload({ eventType: "ACTOR.RUN.FAILED", resource: { id: "r9" } })?.runId).toBe("r9");
    expect(parseWebhookPayload({ eventType: "ACTOR.RUN.FAILED", eventData: { actorRunId: "r8" }, resource: { id: "r9" } })?.runId).toBe("r8");
  });

  it("olay adı bitiş durumuna çevrilir (TIMED_OUT → TIMED-OUT → timed_out)", () => {
    const cases: [string, string, string][] = [
      ["ACTOR.RUN.SUCCEEDED", "SUCCEEDED", "succeeded"],
      ["ACTOR.RUN.FAILED", "FAILED", "failed"],
      ["ACTOR.RUN.ABORTED", "ABORTED", "aborted"],
      ["ACTOR.RUN.TIMED_OUT", "TIMED-OUT", "timed_out"],
    ];
    for (const [eventType, status, runStatus] of cases) {
      const event = parseWebhookPayload({ eventType, eventData: { actorRunId: "r1" } });
      expect(event).toMatchObject({ status, runStatus });
    }
  });

  it("bitmemiş/bilinmeyen olayda runStatus undefined kalır", () => {
    const event = parseWebhookPayload({ eventType: "ACTOR.RUN.CREATED", eventData: { actorRunId: "r1" }, resource: { status: "READY" } });
    expect(event).toMatchObject({ status: "READY", runStatus: undefined });
  });

  it("usageTotalUsd yoksa/geçersizse undefined (0 uydurulmaz)", () => {
    expect(parseWebhookPayload({ eventType: "X", eventData: { actorRunId: "r1" } })?.usageTotalUsd).toBeUndefined();
    expect(parseWebhookPayload({ eventType: "X", eventData: { actorRunId: "r1" }, resource: { usageTotalUsd: -3 } })?.usageTotalUsd).toBeUndefined();
    expect(parseWebhookPayload({ eventType: "X", eventData: { actorRunId: "r1" }, resource: { usageTotalUsd: 0.5 } })?.usageTotalUsd).toBe(0.5);
  });

  it("koşu kimliği hiç yoksa undefined", () => {
    expect(parseWebhookPayload({ eventType: "ACTOR.RUN.SUCCEEDED" })).toBeUndefined();
    expect(parseWebhookPayload({ eventType: "ACTOR.RUN.SUCCEEDED", eventData: { actorRunId: "" } })).toBeUndefined();
    expect(parseWebhookPayload(null)).toBeUndefined();
  });
});

describe("buildRunWebhooks", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("gizli başlığı headersTemplate'e yazar; tüm bitiş olaylarına abone olur", () => {
    vi.stubEnv("APIFY_WEBHOOK_SECRET", SECRET);
    const [spec, ...rest] = buildRunWebhooks({ requestUrl: "https://panel.example.test/api/webhooks/apify" });
    expect(rest).toHaveLength(0);
    expect(spec.eventTypes).toEqual([...RUN_WEBHOOK_EVENT_TYPES]);
    expect(spec.requestUrl).toBe("https://panel.example.test/api/webhooks/apify");
    expect(JSON.parse(spec.headersTemplate ?? "")).toEqual({ [WEBHOOK_SECRET_HEADER]: SECRET });
  });

  it("gizli yok/kısa, URL geçersiz ya da https değilse fırlatır (iletide gizli değer yok)", () => {
    vi.stubEnv("APIFY_WEBHOOK_SECRET", "");
    expect(() => buildRunWebhooks({ requestUrl: "https://x.test/h" })).toThrow(/APIFY_WEBHOOK_SECRET/);
    vi.stubEnv("APIFY_WEBHOOK_SECRET", SECRET);
    expect(() => buildRunWebhooks({ requestUrl: "yok" })).toThrow(/URL/);
    expect(() => buildRunWebhooks({ requestUrl: "http://x.test/h" })).toThrow(/https/);
    let message = "";
    try {
      buildRunWebhooks({ requestUrl: "http://x.test/h" });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).not.toContain(SECRET);
  });
});
