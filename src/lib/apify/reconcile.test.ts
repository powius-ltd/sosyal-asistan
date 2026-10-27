/**
 * Mutabakat (`reconcileRun`, `reconcileOpenRuns`): iki aşamalı kural — geçici actual_usd (yalnız yukarı) → koşu bitiminden ≥ 60 sn
 * sonra iki ardışık AYNI okumada KESİN (usage_settled_at; reserved_usd yalnız o zaman iner). Rezervasyon ve koşu yaşam döngüsü
 * testleri `budget.test.ts`'tedir.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BudgetExceededError, reserveBudget } from "@/lib/apify/budget";
import { isReconcilePending, reconcileOpenRuns, reconcileRun } from "@/lib/apify/reconcile";
import { createFakeRunsDb, jsonResponse, runEnvelope, TEST_WORKSPACE_ID } from "@/lib/apify/test-support";

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

const NOW = new Date("2026-09-30T12:00:00.000Z");
/** Koşu bitimi: NOW'dan 90 sn önce (≥ 60 sn: kesinleşmeye yeterince eski) ve 20 sn önce (genç). */
const OLD_FINISH = "2026-09-30T11:58:30.000Z";
const YOUNG_FINISH = "2026-09-30T11:59:40.000Z";

/** Apify `GET /actor-runs/{id}` yanıtı (bitiş anıyla). */
function apifyRunAt(status: string, usageTotalUsd: number | undefined, finishedAt: string | null = OLD_FINISH) {
  fetchMock.mockResolvedValueOnce(jsonResponse(runEnvelope({ status, usageTotalUsd, finishedAt: finishedAt ?? undefined })));
}

const runDeps = (db: ReturnType<typeof createFakeRunsDb>) => ({ client: db.client, now: NOW });

describe("reconcileRun — iki aşamalı mutabakat (geçici → kesin)", () => {
  it("ilk okuma: GEÇİCİ actual_usd yazılır; reserved_usd dokunulmaz, kesinleşme damgası yok", async () => {
    const db = createFakeRunsDb({ rows: [{ reserved_usd: 0.5, status: "succeeded", external_run_id: "ap1" }] });
    const [row] = db.rows;
    apifyRunAt("SUCCEEDED", 0.0123);

    expect(await reconcileRun(row.id, runDeps(db))).toEqual({ outcome: "provisional", actualUsd: 0.0123, reason: "first_read" });
    expect(row).toMatchObject({ actual_usd: 0.0123, reserved_usd: 0.5, usage_settled_at: null });
  });

  it("ikinci okuma aynı + koşu ≥ 60 sn önce bitti: KESİNLEŞİR — usage_settled_at atılır, reserved_usd gerçek tutara iner", async () => {
    const db = createFakeRunsDb({ rows: [{ reserved_usd: 0.5, status: "succeeded", external_run_id: "ap1" }] });
    const [row] = db.rows;
    apifyRunAt("SUCCEEDED", 0.0123);
    apifyRunAt("SUCCEEDED", 0.0123);

    await reconcileRun(row.id, runDeps(db));
    const result = await reconcileRun(row.id, runDeps(db));

    expect(result).toEqual({ outcome: "reconciled", actualUsd: 0.0123, reservedUsd: 0.0123 });
    expect(row).toMatchObject({ actual_usd: 0.0123, reserved_usd: 0.0123, usage_settled_at: NOW.toISOString() });
  });

  it("tek okuma asla kesinleştirmez: koşu ne kadar eski olursa olsun ilk okuma geçicidir", async () => {
    const db = createFakeRunsDb({ rows: [{ reserved_usd: 0.4, status: "succeeded", external_run_id: "ap1" }] });
    apifyRunAt("SUCCEEDED", 0.027, "2026-09-30T10:00:00.000Z"); // 2 saat önce bitti
    const result = await reconcileRun(db.rows[0].id, runDeps(db));
    expect(result).toMatchObject({ outcome: "provisional", reason: "first_read" });
    expect(db.rows[0]).toMatchObject({ reserved_usd: 0.4, usage_settled_at: null });
  });

  it("değer sabit ama koşu bitiminden < 60 sn: kesinleşmez (too_young), hiçbir şey yazılmaz, rezerve aynen", async () => {
    const db = createFakeRunsDb({ rows: [{ reserved_usd: 0.5, actual_usd: 0.03, status: "succeeded", external_run_id: "ap1" }] });
    apifyRunAt("SUCCEEDED", 0.03, YOUNG_FINISH);

    expect(await reconcileRun(db.rows[0].id, runDeps(db))).toEqual({ outcome: "provisional", actualUsd: 0.03, reason: "too_young" });
    expect(db.updates).toHaveLength(0);
    expect(db.rows[0]).toMatchObject({ reserved_usd: 0.5, usage_settled_at: null });
  });

  it("kullanım hâlâ artıyor: geçici tutar YUKARI güncellenir (changed), kesinleşmez, rezerve aynen", async () => {
    const db = createFakeRunsDb({ rows: [{ reserved_usd: 0.5, actual_usd: 0.01, status: "succeeded", external_run_id: "ap1" }] });
    apifyRunAt("SUCCEEDED", 0.02);

    expect(await reconcileRun(db.rows[0].id, runDeps(db))).toEqual({ outcome: "provisional", actualUsd: 0.02, reason: "changed" });
    expect(db.rows[0]).toMatchObject({ actual_usd: 0.02, reserved_usd: 0.5, usage_settled_at: null });
  });

  it("düşük okuma (aksaklık) tutarı AŞAĞI çekmez: geçici değer korunur ve sabit sayılmaz", async () => {
    const db = createFakeRunsDb({ rows: [{ reserved_usd: 0.5, actual_usd: 0.02, status: "succeeded", external_run_id: "ap1" }] });
    apifyRunAt("SUCCEEDED", 0.005);

    expect(await reconcileRun(db.rows[0].id, runDeps(db))).toEqual({ outcome: "provisional", actualUsd: 0.02, reason: "changed" });
    expect(db.updates).toHaveLength(0);
    expect(db.rows[0].actual_usd).toBe(0.02);
  });

  it("gerçek > rezerve: kesinleşince actual yazılır, rezerve korunur (ay toplamı actual'ı sayar)", async () => {
    const db = createFakeRunsDb({ rows: [{ reserved_usd: 0.05, status: "succeeded", external_run_id: "ap1" }] });
    const [row] = db.rows;
    apifyRunAt("SUCCEEDED", 0.2);
    apifyRunAt("SUCCEEDED", 0.2);

    await reconcileRun(row.id, runDeps(db));
    expect(await reconcileRun(row.id, runDeps(db))).toEqual({ outcome: "reconciled", actualUsd: 0.2, reservedUsd: 0.05 });
    expect(Math.max(row.actual_usd ?? 0, row.reserved_usd)).toBe(0.2);
  });

  it("GEÇİCİ actual da tavanda alt sınır sayılır: rezerveyi aşan geçici tutar sonraki rezervasyonu hemen daraltır", async () => {
    const db = createFakeRunsDb({ capUsd: 0.25, rows: [{ reserved_usd: 0.05, status: "succeeded", external_run_id: "ap1" }] });
    apifyRunAt("SUCCEEDED", 0.2);
    await reconcileRun(db.rows[0].id, runDeps(db)); // geçici 0,20 (> rezerve 0,05)

    await expect(reserveBudget(TEST_WORKSPACE_ID, "apify", 0.1, { kind: "content" }, { client: db.client })).rejects.toBeInstanceOf(BudgetExceededError);
    await expect(reserveBudget(TEST_WORKSPACE_ID, "apify", 0.05, { kind: "content" }, { client: db.client })).resolves.toMatchObject({ reserved_usd: 0.05 });
  });

  it("rezerve YALNIZ kesinleşince serbest kalır: geçici aşamada tavan payı aynen, kesinleşince geri açılır", async () => {
    const db = createFakeRunsDb({ capUsd: 1, rows: [{ reserved_usd: 0.9, status: "succeeded", external_run_id: "ap1" }] });
    apifyRunAt("SUCCEEDED", 0.1);
    await reconcileRun(db.rows[0].id, runDeps(db)); // geçici
    await expect(reserveBudget(TEST_WORKSPACE_ID, "apify", 0.5, { kind: "content" }, { client: db.client })).rejects.toBeInstanceOf(BudgetExceededError);

    apifyRunAt("SUCCEEDED", 0.1);
    await reconcileRun(db.rows[0].id, runDeps(db)); // kesin
    await expect(reserveBudget(TEST_WORKSPACE_ID, "apify", 0.5, { kind: "content" }, { client: db.client })).resolves.toMatchObject({ reserved_usd: 0.5 });
  });

  it("usageTotalUsd 0 / hiç bildirilmemiş / negatif: HİÇBİR ŞEY YAZILMAZ (actual_usd null kalır, rezerve aynen)", async () => {
    for (const usage of [0, undefined, -1]) {
      const db = createFakeRunsDb({ rows: [{ reserved_usd: 0.4, status: "succeeded", external_run_id: "ap1" }] });
      apifyRunAt("SUCCEEDED", usage);
      expect(await reconcileRun(db.rows[0].id, runDeps(db)), String(usage)).toEqual({ outcome: "usage_unavailable" });
      expect(db.rows[0]).toMatchObject({ actual_usd: null, reserved_usd: 0.4 });
      expect(db.updates).toHaveLength(0);
    }
  });

  it("koşu Apify'da hâlâ çalışıyorsa yazılmaz (kısmi kullanım nihai değildir)", async () => {
    const db = createFakeRunsDb({ rows: [{ reserved_usd: 0.4, status: "running", external_run_id: "ap1" }] });
    apifyRunAt("RUNNING", 0.01);
    expect(await reconcileRun(db.rows[0].id, runDeps(db))).toEqual({ outcome: "not_finished", apifyStatus: "RUNNING" });
    expect(db.updates).toHaveLength(0);
  });

  it("başarısız/iptal koşu da ücretlenmiş olabilir: aynı iki aşamalı kural", async () => {
    const db = createFakeRunsDb({ rows: [{ reserved_usd: 0.4, status: "failed", external_run_id: "ap1" }] });
    apifyRunAt("FAILED", 0.03);
    apifyRunAt("FAILED", 0.03);
    await reconcileRun(db.rows[0].id, runDeps(db));
    expect((await reconcileRun(db.rows[0].id, runDeps(db))).outcome).toBe("reconciled");
    expect(db.rows[0]).toMatchObject({ actual_usd: 0.03, reserved_usd: 0.03 });
  });

  it("zaten KESİNLEŞMİŞ koşu Apify'a gitmeden 'already_reconciled' döner (0 da mutabakattır); bir daha değişmez", async () => {
    const db = createFakeRunsDb({ rows: [{ reserved_usd: 0, actual_usd: 0, usage_settled_at: "2026-09-30T11:00:00.000Z", external_run_id: "ap1" }] });
    expect(await reconcileRun(db.rows[0].id, runDeps(db))).toEqual({ outcome: "already_reconciled", actualUsd: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("okuma ile yazma arasında başka süreç kesinleştirirse kesin tutar EZİLMEZ (already_reconciled)", async () => {
    const db = createFakeRunsDb({ rows: [{ reserved_usd: 0.5, status: "succeeded", external_run_id: "ap1" }] });
    const [row] = db.rows;
    fetchMock.mockImplementationOnce(async () => {
      row.actual_usd = 0.09;
      row.usage_settled_at = "2026-09-30T11:59:00.000Z";
      return jsonResponse(runEnvelope({ status: "SUCCEEDED", usageTotalUsd: 0.05, finishedAt: OLD_FINISH }));
    });
    expect(await reconcileRun(row.id, runDeps(db))).toEqual({ outcome: "already_reconciled" });
    expect(row.actual_usd).toBe(0.09);
  });

  it("bitiş anı: Apify finishedAt yoksa satırın finished_at'i kullanılır; ikisi de yoksa yaş 0 (kesinleşmez)", async () => {
    const withRowFinish = createFakeRunsDb({ rows: [{ reserved_usd: 0.4, actual_usd: 0.02, status: "succeeded", external_run_id: "ap1", finished_at: OLD_FINISH }] });
    apifyRunAt("SUCCEEDED", 0.02, null);
    expect((await reconcileRun(withRowFinish.rows[0].id, runDeps(withRowFinish))).outcome).toBe("reconciled");

    const unknownFinish = createFakeRunsDb({ rows: [{ reserved_usd: 0.4, actual_usd: 0.02, status: "succeeded", external_run_id: "ap1", finished_at: null }] });
    apifyRunAt("SUCCEEDED", 0.02, null);
    expect(await reconcileRun(unknownFinish.rows[0].id, runDeps(unknownFinish))).toMatchObject({ outcome: "provisional", reason: "too_young" });
  });

  it("Apify'a hiç gitmemiş, başka sağlayıcı, abonelik ve bilinmeyen koşu için Apify çağrılmaz", async () => {
    const db = createFakeRunsDb({
      rows: [
        { external_run_id: null },
        { provider: "anthropic", external_run_id: "x" },
        { provider: "gemini", billing: "subscription", external_run_id: null },
      ],
    });
    expect(await reconcileRun(db.rows[0].id, runDeps(db))).toEqual({ outcome: "no_external_run" });
    expect(await reconcileRun(db.rows[1].id, runDeps(db))).toEqual({ outcome: "unsupported_provider" });
    expect(await reconcileRun(db.rows[2].id, runDeps(db))).toEqual({ outcome: "subscription" });
    expect(await reconcileRun("00000000-0000-4000-8000-999999999999", runDeps(db))).toEqual({ outcome: "not_found" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("isReconcilePending", () => {
  it("yalnız tekrar denenince değişebilecek sonuçlar beklemede sayılır", () => {
    expect(isReconcilePending({ outcome: "provisional", actualUsd: 0.1, reason: "first_read" })).toBe(true);
    expect(isReconcilePending({ outcome: "not_finished", apifyStatus: "RUNNING" })).toBe(true);
    expect(isReconcilePending({ outcome: "usage_unavailable" })).toBe(true);
    for (const done of [
      { outcome: "reconciled", actualUsd: 1, reservedUsd: 1 },
      { outcome: "already_reconciled" },
      { outcome: "subscription" },
      { outcome: "no_external_run" },
      { outcome: "unsupported_provider" },
      { outcome: "not_found" },
    ] as const) {
      expect(isReconcilePending(done), done.outcome).toBe(false);
    }
  });
});

describe("reconcileOpenRuns", () => {
  it("yalnız Apify'a gitmiş + ücretli + KESİNLEŞMEMİŞ + yakın tarihli koşulara bakar; geçici olanlar beklemede sayılır", async () => {
    const db = createFakeRunsDb({
      rows: [
        { external_run_id: "done", reserved_usd: 0.4, actual_usd: 0.07, status: "succeeded", started_at: "2026-09-30T11:00:00.000Z" },
        { external_run_id: "zero", reserved_usd: 0.4, status: "succeeded", started_at: "2026-09-30T10:00:00.000Z" },
        { external_run_id: null, reserved_usd: 0, status: "failed", started_at: "2026-09-30T09:00:00.000Z" },
        { external_run_id: "old", reserved_usd: 0.4, status: "succeeded", started_at: "2026-09-01T09:00:00.000Z" },
        { external_run_id: "settled", reserved_usd: 0.4, actual_usd: 0.3, usage_settled_at: "2026-09-30T08:30:00.000Z", started_at: "2026-09-30T08:00:00.000Z" },
        { provider: "gemini", billing: "subscription", external_run_id: "x", status: "ingested", started_at: "2026-09-30T07:00:00.000Z" },
      ],
    });
    fetchMock.mockImplementation(async (input) =>
      String(input).endsWith("/actor-runs/done")
        ? jsonResponse(runEnvelope({ id: "done", status: "SUCCEEDED", usageTotalUsd: 0.07, finishedAt: OLD_FINISH }))
        : jsonResponse(runEnvelope({ id: "zero", status: "SUCCEEDED", usageTotalUsd: 0, finishedAt: OLD_FINISH })),
    );

    const summary = await reconcileOpenRuns({}, { client: db.client, now: NOW });

    // "done": önceki geçici okuma 0,07 = bu okuma → kesinleşir. "zero": kullanım görünmüyor → beklemede.
    expect(summary).toEqual({ checked: 2, reconciled: 1, pending: 1, errors: 0 });
    expect(db.rows[0]).toMatchObject({ actual_usd: 0.07, reserved_usd: 0.07, usage_settled_at: NOW.toISOString() });
    expect(db.rows[1].actual_usd).toBeNull();
    expect(db.rows[4]).toMatchObject({ actual_usd: 0.3, reserved_usd: 0.4 }); // kesinleşmiş koşuya dokunulmadı
  });

  it("ilk okuması yapılan koşu (geçici) bu turda beklemede sayılır, sonraki turda kesinleşir", async () => {
    const db = createFakeRunsDb({ rows: [{ external_run_id: "a", reserved_usd: 0.4, status: "succeeded", started_at: "2026-09-30T11:00:00.000Z" }] });
    fetchMock.mockImplementation(async () => jsonResponse(runEnvelope({ id: "a", status: "SUCCEEDED", usageTotalUsd: 0.02, finishedAt: OLD_FINISH })));

    expect(await reconcileOpenRuns({}, { client: db.client, now: NOW })).toEqual({ checked: 1, reconciled: 0, pending: 1, errors: 0 });
    expect(db.rows[0]).toMatchObject({ actual_usd: 0.02, usage_settled_at: null });
    expect(await reconcileOpenRuns({}, { client: db.client, now: NOW })).toEqual({ checked: 1, reconciled: 1, pending: 0, errors: 0 });
    expect(db.rows[0]).toMatchObject({ actual_usd: 0.02, reserved_usd: 0.02, usage_settled_at: NOW.toISOString() });
  });

  it("bir koşunun Apify okuması patlarsa diğerleri yine işlenir", async () => {
    const db = createFakeRunsDb({
      rows: [
        { external_run_id: "bad", reserved_usd: 0.4, status: "succeeded", started_at: "2026-09-30T11:00:00.000Z" },
        { external_run_id: "good", reserved_usd: 0.4, status: "succeeded", started_at: "2026-09-30T10:00:00.000Z" },
      ],
    });
    fetchMock.mockImplementation(async (input) =>
      String(input).endsWith("/actor-runs/bad")
        ? jsonResponse({ error: "yok" }, 404)
        : jsonResponse(runEnvelope({ id: "good", status: "SUCCEEDED", usageTotalUsd: 0.02, finishedAt: OLD_FINISH })),
    );

    const summary = await reconcileOpenRuns({}, { client: db.client, now: NOW });

    expect(summary).toEqual({ checked: 2, reconciled: 0, pending: 1, errors: 1 });
    expect(db.rows[1].actual_usd).toBe(0.02); // geçici okuma yazıldı
  });

  it("APIFY_TOKEN yoksa tur sessizce geçilmez: yapılandırma hatası yükselir", async () => {
    vi.stubEnv("APIFY_TOKEN", "");
    const db = createFakeRunsDb({ rows: [{ external_run_id: "a", reserved_usd: 0.4, status: "succeeded" }] });
    await expect(reconcileOpenRuns({}, { client: db.client, now: new Date("2026-09-30T12:00:00.000Z") })).rejects.toThrow(/APIFY_TOKEN tanımlı değil/);
  });
});
