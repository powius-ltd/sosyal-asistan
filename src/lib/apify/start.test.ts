import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BudgetExceededError } from "@/lib/apify/budget";
import { ApifyApiError } from "@/lib/apify/client";
import { clearActorPricingCache, FALLBACK_UNIT_PRICE_USD } from "@/lib/apify/pricing";
import { startBudgetedRun } from "@/lib/apify/start";
import { createFakeRunsDb, jsonResponse, runEnvelope, TEST_WORKSPACE_ID } from "@/lib/apify/test-support";

const fetchMock = vi.fn<typeof fetch>();

const REQUEST = {
  workspaceId: TEST_WORKSPACE_ID,
  actorId: "apify/instagram-scraper",
  input: { directUrls: ["https://www.instagram.com/kahve/"], resultsLimit: 30 },
  kind: "content",
  expectedResults: 30,
  targetLabel: "@kahve",
};

/** Aktör GET'i: sonuç başı $0,01 (30 sonuç → $0,30 rezerve). */
const ACTOR_BODY = { data: { id: "actor1", pricingInfos: [{ pricingModel: "PRICE_PER_UNIT", pricePerUnitUsd: 0.01 }] } };

interface Routes {
  actor?: () => Response | Promise<Response>;
  startRun?: () => Response | Promise<Response>;
  abort?: () => Response | Promise<Response>;
}

function routeFetch(routes: Routes) {
  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    if (method === "POST" && url.pathname.endsWith("/runs")) return (routes.startRun ?? (() => jsonResponse(runEnvelope())))();
    if (method === "POST" && url.pathname.endsWith("/abort")) return (routes.abort ?? (() => jsonResponse(runEnvelope({ status: "ABORTING" }))))();
    if (method === "GET" && url.pathname.startsWith("/v2/acts/")) return (routes.actor ?? (() => jsonResponse(ACTOR_BODY)))();
    throw new Error(`Beklenmeyen istek: ${method} ${url.pathname}`);
  });
}

const postRunCalls = () =>
  fetchMock.mock.calls.filter(([url, init]) => init?.method === "POST" && String(url).includes("/runs"));

beforeEach(() => {
  vi.stubEnv("APIFY_TOKEN", "apify_api_test-token-not-real");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  clearActorPricingCache();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("startBudgetedRun", () => {
  it("mutlu yol: fiyat oku → $0,30 rezerve → başlat → running + kimlikler kayıtlı", async () => {
    routeFetch({});
    const db = createFakeRunsDb();

    const result = await startBudgetedRun(REQUEST, { client: db.client });

    expect(db.rpcCalls).toHaveLength(1);
    expect(db.rpcCalls[0].args).toMatchObject({ p_provider: "apify", p_amount: 0.3 });
    expect(postRunCalls()).toHaveLength(1);
    expect(result).toMatchObject({ externalRunId: "apifyRun1", datasetId: "dataset1" });
    expect(result.estimate).toEqual({ amountUsd: 0.3, unitPriceUsd: 0.01, priceUnknown: false });
    expect(db.rows[0]).toMatchObject({
      status: "running",
      reserved_usd: 0.3,
      external_run_id: "apifyRun1",
      dataset_id: "dataset1",
      actual_usd: null,
      price_unknown: false,
    });
    expect(result.run).toMatchObject({ id: db.rows[0].id, status: "running" });
  });

  it("TAVAN AŞILINCA `POST /runs` HİÇ çağrılmaz ve koşu satırı açılmaz", async () => {
    routeFetch({});
    const db = createFakeRunsDb({ capUsd: 0.25 });

    const error = await startBudgetedRun(REQUEST, { client: db.client }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BudgetExceededError);
    expect(error).toMatchObject({ amount: 0.3, spent: 0, cap: 0.25 });
    expect(postRunCalls()).toHaveLength(0);
    expect(fetchMock.mock.calls.every(([, init]) => (init?.method ?? "GET") === "GET")).toBe(true);
    expect(db.rows).toHaveLength(0);
  });

  it("tavan $0 (harcama kapalı) da paralı koşuyu başlatmaz", async () => {
    routeFetch({});
    const db = createFakeRunsDb({ capUsd: 0 });
    await expect(startBudgetedRun(REQUEST, { client: db.client })).rejects.toBeInstanceOf(BudgetExceededError);
    expect(postRunCalls()).toHaveLength(0);
  });

  it("başlatma HTTP hatasıyla düşerse rezervasyon 0'a çekilir, durum failed, hata yeniden fırlar", async () => {
    routeFetch({ startRun: () => jsonResponse({ error: { message: "Invalid input" } }, 400) });
    const db = createFakeRunsDb();

    const error = await startBudgetedRun(REQUEST, { client: db.client }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApifyApiError);
    expect(postRunCalls()).toHaveLength(1);
    expect(db.rows).toHaveLength(1);
    expect(db.rows[0]).toMatchObject({ reserved_usd: 0, status: "failed", external_run_id: null, actual_usd: null });
    expect(db.rows[0].error).toContain("Apify başlatılamadı");
    expect(db.rows[0].finished_at).not.toBeNull();
  });

  it("ağ hatasında da rezervasyon 0'a çekilir", async () => {
    routeFetch({
      startRun: () => {
        throw new TypeError("fetch failed");
      },
    });
    const db = createFakeRunsDb();
    await expect(startBudgetedRun(REQUEST, { client: db.client })).rejects.toThrow("fetch failed");
    expect(db.rows[0]).toMatchObject({ reserved_usd: 0, status: "failed" });
  });

  it("sıfırlanan rezervasyon tavandan düşer: aynı tutarlık sonraki koşu başlar", async () => {
    const db = createFakeRunsDb({ capUsd: 0.3 });
    routeFetch({ startRun: () => jsonResponse({ error: "x" }, 400) });
    await startBudgetedRun(REQUEST, { client: db.client }).catch(() => undefined);
    routeFetch({});
    await expect(startBudgetedRun(REQUEST, { client: db.client })).resolves.toMatchObject({ externalRunId: "apifyRun1" });
  });

  it("fiyat okunamazsa muhafazakâr tutar rezerve edilir ve price_unknown işaretlenir", async () => {
    routeFetch({ actor: () => jsonResponse({ data: { id: "a", pricingInfos: [] } }) });
    const db = createFakeRunsDb();

    await startBudgetedRun(REQUEST, { client: db.client });

    expect(db.rpcCalls[0].args.p_amount).toBe(Math.round(30 * FALLBACK_UNIT_PRICE_USD * 1e6) / 1e6);
    expect(db.rows[0]).toMatchObject({ price_unknown: true, status: "running" });
  });

  it("APIFY_TOKEN yoksa rezervasyon HİÇ açılmaz", async () => {
    vi.stubEnv("APIFY_TOKEN", "");
    routeFetch({});
    const db = createFakeRunsDb();
    await expect(startBudgetedRun(REQUEST, { client: db.client })).rejects.toThrow(/APIFY_TOKEN tanımlı değil/);
    expect(db.rpcCalls).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("koşu Apify'da açıldı ama kimlikler kaydedilemedi: koşu iptal edilir, rezerve tutar KORUNUR, satır aborted", async () => {
    routeFetch({});
    const db = createFakeRunsDb({ failFirstUpdates: 1 }); // markRunStarted düşer

    await expect(startBudgetedRun(REQUEST, { client: db.client })).rejects.toThrow(/veritabanına ulaşılamadı/);

    const abortCalls = fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/abort"));
    expect(abortCalls).toHaveLength(1);
    expect(String(abortCalls[0][0])).toContain("/actor-runs/apifyRun1/abort");
    expect(db.rows[0]).toMatchObject({ status: "aborted", reserved_usd: 0.3, actual_usd: null });
    expect(db.rows[0].error).toContain("Başlatma kaydedilemedi");
  });
});
