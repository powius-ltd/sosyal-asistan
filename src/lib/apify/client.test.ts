import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  abortRun,
  ApifyApiError,
  ApifyConfigError,
  getDatasetItems,
  getRun,
  startRun,
} from "@/lib/apify/client";
import { jsonResponse, runEnvelope } from "@/lib/apify/test-support";

// Sahte token (gerçek değil): yalnız "URL'de/iletide yok" denetimi için.
const FAKE_TOKEN = "apify_api_test-token-not-real";

const fetchMock = vi.fn<typeof fetch>();

function requests() {
  return fetchMock.mock.calls.map(([url, init]) => ({
    url: String(url),
    method: init?.method ?? "GET",
    headers: init?.headers as Record<string, string>,
    body: init?.body as string | undefined,
  }));
}

describe("Apify istemcisi", () => {
  beforeEach(() => {
    vi.stubEnv("APIFY_TOKEN", FAKE_TOKEN);
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("token Authorization: Bearer başlığında gider, hiçbir istek URL'sinde yoktur", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/datasets/")) return jsonResponse([{ id: 1 }]);
      if (url.endsWith("/abort")) return jsonResponse(runEnvelope({ status: "ABORTING" }));
      if (url.includes("/actor-runs/")) return jsonResponse(runEnvelope({ status: "SUCCEEDED" }));
      return jsonResponse(runEnvelope());
    });

    await startRun("apify/instagram-scraper", { a: 1 }, { webhooks: [{ eventTypes: ["ACTOR.RUN.SUCCEEDED"], requestUrl: "https://x.test/h" }] });
    await getRun("apifyRun1");
    await abortRun("apifyRun1");
    await getDatasetItems("dataset1", { offset: 0, limit: 10 });

    const sent = requests();
    expect(sent).toHaveLength(4);
    for (const request of sent) {
      expect(request.url).not.toContain(FAKE_TOKEN);
      expect(request.url).not.toMatch(/token=/i);
      expect(request.url.startsWith("https://api.apify.com/v2/")).toBe(true);
      expect(request.headers.authorization).toBe(`Bearer ${FAKE_TOKEN}`);
    }
  });

  it("startRun: aktör kimliği sahip~ad olur, girdi gövdede, webhook base64 sorgu parametresidir", async () => {
    fetchMock.mockResolvedValue(jsonResponse(runEnvelope()));
    const webhooks = [{ eventTypes: ["ACTOR.RUN.SUCCEEDED"], requestUrl: "https://x.test/h" }];

    const started = await startRun("apify/instagram-scraper", { directUrls: ["u"] }, { webhooks });

    const [request] = requests();
    expect(request.method).toBe("POST");
    const url = new URL(request.url);
    expect(url.pathname).toBe("/v2/acts/apify~instagram-scraper/runs");
    expect(JSON.parse(request.body ?? "")).toEqual({ directUrls: ["u"] });
    expect(JSON.parse(Buffer.from(url.searchParams.get("webhooks") ?? "", "base64").toString("utf8"))).toEqual(webhooks);
    expect(started).toEqual({ runId: "apifyRun1", datasetId: "dataset1", status: "RUNNING" });
  });

  it("webhook yoksa `webhooks` parametresi eklenmez", async () => {
    fetchMock.mockResolvedValue(jsonResponse(runEnvelope()));
    await startRun("apify/instagram-scraper", {});
    expect(new URL(requests()[0].url).searchParams.has("webhooks")).toBe(false);
  });

  it("getRun: usageTotalUsd yoksa/geçersizse undefined (0 değil)", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(runEnvelope({ status: "SUCCEEDED" })));
    fetchMock.mockResolvedValueOnce(jsonResponse(runEnvelope({ status: "SUCCEEDED", usageTotalUsd: 0.0123 })));
    expect((await getRun("r")).usageTotalUsd).toBeUndefined();
    expect((await getRun("r")).usageTotalUsd).toBe(0.0123);
  });

  it("getDatasetItems: offset/limit sorguya girer, yanıt dizidir", async () => {
    fetchMock.mockResolvedValue(jsonResponse([{ a: 1 }, { a: 2 }]));
    const items = await getDatasetItems("ds1", { offset: 20, limit: 5 });
    const url = new URL(requests()[0].url);
    expect(url.pathname).toBe("/v2/datasets/ds1/items");
    expect(url.searchParams.get("offset")).toBe("20");
    expect(url.searchParams.get("limit")).toBe("5");
    expect(items).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it("APIFY_TOKEN yoksa açık Türkçe hata verir ve hiç istek atmaz", async () => {
    vi.stubEnv("APIFY_TOKEN", "  ");
    await expect(getRun("r")).rejects.toBeInstanceOf(ApifyConfigError);
    await expect(getRun("r")).rejects.toThrow(/APIFY_TOKEN tanımlı değil/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("429/5xx'te bir kez 5 sn sonra tekrar dener; ikinci yanıt başarılıysa sonuç döner", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "rate" }, 429));
    fetchMock.mockResolvedValueOnce(jsonResponse(runEnvelope({ status: "SUCCEEDED" })));

    const pending = getRun("r");
    await vi.advanceTimersByTimeAsync(4_999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect((await pending).status).toBe("SUCCEEDED");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("yeniden deneme de başarısızsa ApifyApiError yükselir (en fazla 2 istek)", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(jsonResponse({ error: "boom" }, 503));

    const pending = getRun("r");
    const assertion = expect(pending).rejects.toMatchObject({ name: "ApifyApiError", status: 503 });
    await vi.advanceTimersByTimeAsync(5_000);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("4xx yeniden denenmez; hata iletisinde token ve sorgu dizesi yoktur", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: { message: `bad token ${FAKE_TOKEN}` } }, 400));
    const webhooks = [{ eventTypes: ["ACTOR.RUN.FAILED"], requestUrl: "https://x.test/h", headersTemplate: '{"s":"gizli"}' }];

    const error = await startRun("apify/instagram-scraper", {}, { webhooks }).catch((e: unknown) => e);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(error).toBeInstanceOf(ApifyApiError);
    const message = (error as Error).message;
    expect(message).toContain("400");
    expect(message).not.toContain(FAKE_TOKEN);
    expect(message).not.toContain("webhooks=");
    expect(message).not.toContain("gizli");
  });

  it("beklenmeyen yanıt şekli açık hatadır (sessizce undefined üretmez)", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: { status: "RUNNING" } }));
    await expect(startRun("apify/instagram-scraper", {})).rejects.toThrow(/beklenmeyen yanıt/);
  });
});
