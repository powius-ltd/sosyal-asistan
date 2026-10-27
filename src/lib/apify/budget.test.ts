import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BudgetExceededError,
  findRunByExternalId,
  markRunFinished,
  markRunStarted,
  releaseReservation,
  reserveBudget,
} from "@/lib/apify/budget";
import { createFakeRunsDb, TEST_WORKSPACE_ID } from "@/lib/apify/test-support";
import { runInJobScope } from "@/lib/job-scope";

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubEnv("APIFY_TOKEN", "apify_api_test-token-not-real");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("reserveBudget", () => {
  it("tutarı 6 ondalığa yuvarlayıp RPC'ye verir ve açılan koşu satırını döndürür", async () => {
    const db = createFakeRunsDb();
    const row = await reserveBudget(
      TEST_WORKSPACE_ID,
      "apify",
      0.30000000000000004,
      { kind: "content", targetLabel: "@kahve", expectedResults: 30, priceUnknown: true },
      { client: db.client },
    );

    expect(db.rpcCalls).toHaveLength(1);
    expect(db.rpcCalls[0].fn).toBe("reserve_budget");
    expect(db.rpcCalls[0].args).toMatchObject({ p_ws: TEST_WORKSPACE_ID, p_provider: "apify", p_amount: 0.3 });
    expect(db.rpcCalls[0].args.p_run).toMatchObject({
      kind: "content",
      target_label: "@kahve",
      expected_results: 30,
      price_unknown: true,
    });
    expect(row).toMatchObject({ status: "reserved", reserved_usd: 0.3, price_unknown: true, actual_usd: null });
  });

  it("iş kapsamında açılan koşu işe bağlanır (panel_job_id); kapsam dışında alan gitmez", async () => {
    const db = createFakeRunsDb();
    const jobId = "33333333-3333-4333-8333-333333333333";
    await runInJobScope(jobId, async () => {
      await Promise.resolve(); // eşzamansız zincir boyunca taşınır
      await reserveBudget(TEST_WORKSPACE_ID, "apify", 0.1, { kind: "content" }, { client: db.client });
    });
    await reserveBudget(TEST_WORKSPACE_ID, "apify", 0.1, { kind: "content" }, { client: db.client });
    expect((db.rpcCalls[0].args.p_run as { panel_job_id?: string }).panel_job_id).toBe(jobId);
    expect((db.rpcCalls[1].args.p_run as { panel_job_id?: string }).panel_job_id).toBeUndefined();
  });

  it("billing: verilmezse metered; abonelik koşusu 0 USD rezerve eder, RPC'ye billing gider, tavan dolu olsa da açılır", async () => {
    const db = createFakeRunsDb({ capUsd: 1, rows: [{ reserved_usd: 1 }] });
    const metered = await reserveBudget(TEST_WORKSPACE_ID, "apify", 0, { kind: "content" }, { client: db.client });
    expect(metered.billing).toBe("metered");

    const sub = await reserveBudget(TEST_WORKSPACE_ID, "gemini", 0, { kind: "video_analysis", billing: "subscription", targetLabel: "agy · 1 video" }, { client: db.client });
    expect(db.rpcCalls[1].args.p_run).toMatchObject({ kind: "video_analysis", billing: "subscription" });
    expect(sub).toMatchObject({ billing: "subscription", reserved_usd: 0, actual_usd: null, provider: "gemini" });
  });

  it("tavan aşılırsa BudgetExceededError { spent, amount, cap } fırlatır ve satır açılmaz", async () => {
    const db = createFakeRunsDb({ capUsd: 1, rows: [{ reserved_usd: 0.9 }] });
    const error = await reserveBudget(TEST_WORKSPACE_ID, "apify", 0.5, { kind: "content" }, { client: db.client }).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(BudgetExceededError);
    expect(error).toMatchObject({ spent: 0.9, amount: 0.5, cap: 1 });
    expect((error as Error).message).toContain("tavan");
    expect(db.rows).toHaveLength(1);
  });

  it("DB ayrıntısı okunamazsa spent/cap undefined kalır (0 uydurulmaz)", async () => {
    const db = createFakeRunsDb({ rpcError: { message: "budget_exceeded" } });
    const error = await reserveBudget(TEST_WORKSPACE_ID, "apify", 1, { kind: "content" }, { client: db.client }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(BudgetExceededError);
    expect(error).toMatchObject({ amount: 1, spent: undefined, cap: undefined });
  });

  it("başka RPC hataları BudgetExceededError değildir", async () => {
    const db = createFakeRunsDb({ rpcError: { message: "workspace_not_found" } });
    const error = await reserveBudget(TEST_WORKSPACE_ID, "apify", 1, { kind: "content" }, { client: db.client }).catch(
      (e: unknown) => e,
    );
    expect(error).not.toBeInstanceOf(BudgetExceededError);
    expect((error as Error).message).toContain("workspace_not_found");
  });

  it("negatif/NaN tutarı RPC'ye gitmeden reddeder", async () => {
    const db = createFakeRunsDb();
    await expect(reserveBudget(TEST_WORKSPACE_ID, "apify", -1, { kind: "content" }, { client: db.client })).rejects.toThrow(RangeError);
    await expect(reserveBudget(TEST_WORKSPACE_ID, "apify", Number.NaN, { kind: "content" }, { client: db.client })).rejects.toThrow(RangeError);
    expect(db.rpcCalls).toHaveLength(0);
  });
});

describe("koşu yaşam döngüsü", () => {
  it("markRunStarted: reserved → running + sağlayıcı kimlikleri; ikinci çağrı (durum artık running) uygulanmaz", async () => {
    const db = createFakeRunsDb({ rows: [{ reserved_usd: 0.1 }] });
    const [row] = db.rows;
    expect(await markRunStarted(row.id, { externalRunId: "ap1", datasetId: "ds1" }, { client: db.client })).toBe(true);
    expect(row).toMatchObject({ status: "running", external_run_id: "ap1", dataset_id: "ds1" });
    expect(await markRunStarted(row.id, { externalRunId: "ap2", datasetId: "ds2" }, { client: db.client })).toBe(false);
    expect(row.external_run_id).toBe("ap1");
  });

  it("markRunFinished: sonucu yazar; bitmiş satır (webhook'un ikinci teslimi) değişmez", async () => {
    const db = createFakeRunsDb({ rows: [{ status: "running", external_run_id: "ap1" }] });
    const [row] = db.rows;
    const now = new Date("2026-09-30T09:00:00.000Z");

    expect(await markRunFinished(row.id, { status: "succeeded" }, { client: db.client, now })).toBe(true);
    expect(row).toMatchObject({ status: "succeeded", finished_at: "2026-09-30T09:00:00.000Z" });
    expect(await markRunFinished(row.id, { status: "failed", error: "geç geldi" }, { client: db.client, now })).toBe(false);
    expect(row.status).toBe("succeeded");
  });

  it("markRunFinished: succeeded → ingested geçer ve finished_at değişmez; uygulama saati geride olsa da finished_at ≥ started_at", async () => {
    const db = createFakeRunsDb({ rows: [{ status: "running", started_at: "2026-09-30T10:00:00.000Z" }] });
    const [row] = db.rows;

    await markRunFinished(row.id, { status: "succeeded" }, { client: db.client, now: new Date("2026-09-30T09:59:59.000Z") });
    expect(row.finished_at).toBe("2026-09-30T10:00:00.000Z");

    expect(await markRunFinished(row.id, { status: "ingested", itemCount: 12 }, { client: db.client, now: new Date("2026-09-30T11:00:00.000Z") })).toBe(true);
    expect(row).toMatchObject({ status: "ingested", item_count: 12, finished_at: "2026-09-30T10:00:00.000Z" });
  });

  it("releaseReservation: rezervasyon 0'a iner, durum failed, hata metni yazılır", async () => {
    const db = createFakeRunsDb({ rows: [{ reserved_usd: 0.25 }] });
    const [row] = db.rows;
    expect(await releaseReservation(row.id, "Apify başlatılamadı", { client: db.client, now: new Date("2026-09-30T09:00:00.000Z") })).toBe(true);
    expect(row).toMatchObject({ reserved_usd: 0, status: "failed", error: "Apify başlatılamadı", actual_usd: null });
  });

  it("releaseReservation: Apify'a gitmiş (external_run_id dolu) koşunun tutarını ASLA düşürmez", async () => {
    const db = createFakeRunsDb({ rows: [{ reserved_usd: 0.25, status: "running", external_run_id: "ap1" }] });
    const [row] = db.rows;
    expect(await releaseReservation(row.id, "x", { client: db.client })).toBe(false);
    expect(row).toMatchObject({ reserved_usd: 0.25, status: "running" });
  });

  it("findRunByExternalId: Apify koşu kimliğinden satırı bulur", async () => {
    const db = createFakeRunsDb({ rows: [{ external_run_id: "ap1" }, { external_run_id: "ap2" }] });
    expect((await findRunByExternalId("ap2", { client: db.client }))?.id).toBe(db.rows[1].id);
    expect(await findRunByExternalId("yok", { client: db.client })).toBeUndefined();
  });
});

