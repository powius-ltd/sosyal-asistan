/**
 * Tur sonu mutabakat döngüsü: oturma/yaş mantığı `reconcileRun`'dadır (`budget.test.ts`); burada yalnız döngü davranışı sınanır —
 * `reconcileRun` aralıkla tekrar çağrılır, işi biten koşu bekleyenlerden çıkar, bekleme dolarsa koşu bekleyen kalır.
 */
import { describe, expect, it, vi } from "vitest";
import type { ReconcileResult } from "@/lib/apify/reconcile";
import { readRunReports, settleReconciliation } from "@/lib/collection/run-report";
import type { CollectContext, ResolvedDeps } from "@/lib/collection/types";

const NOW = new Date("2026-09-30T12:00:00.000Z");

function makeCtx(results: (ReconcileResult | Error)[]) {
  let call = 0;
  const reconcile = vi.fn(async () => {
    const next = results[Math.min(call, results.length - 1)];
    call += 1;
    if (next instanceof Error) throw next;
    return next;
  });
  const sleep = vi.fn(async () => undefined);
  const client = {};
  const ctx = {
    workspaceId: "ws",
    now: NOW,
    deps: { client, reconcile, sleep, clock: () => NOW } as unknown as ResolvedDeps,
    log: () => undefined,
    runIds: ["run-1"],
    pending: new Map([["run-1", { externalRunId: "ext-1" }]]),
    notes: [] as string[],
    followers: new Map(),
  } satisfies CollectContext;
  return { ctx, reconcile, sleep, client };
}

const provisional: ReconcileResult = { outcome: "provisional", actualUsd: 0.02, reason: "first_read" };
const settled: ReconcileResult = { outcome: "reconciled", actualUsd: 0.027, reservedUsd: 0.026 };

describe("settleReconciliation", () => {
  it("kesinleşene kadar reconcileRun'ı aralıkla tekrar çağırır; kesinleşince bekleyenlerden çıkar ve durur", async () => {
    const { ctx, reconcile, sleep } = makeCtx([provisional, { ...provisional, reason: "changed" }, { ...provisional, reason: "too_young" }, settled]);
    await settleReconciliation(ctx, 60_000, 10_000);
    expect(reconcile).toHaveBeenCalledTimes(4);
    expect(sleep).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledWith(10_000);
    expect(ctx.pending.size).toBe(0);
  });

  it("her çağrıya istemci ve tek saat (clock) verilir — bekleme/yaş mantığı döngüde yok", async () => {
    const { ctx, reconcile, client } = makeCtx([settled]);
    await settleReconciliation(ctx, 30_000, 10_000);
    expect(reconcile).toHaveBeenCalledWith("run-1", { client, now: NOW });
  });

  it("bekleme süresi dolarsa koşu bekleyen kalır (kesin tutar yazılmaz; cron tamamlar)", async () => {
    const { ctx, reconcile } = makeCtx([provisional]);
    await settleReconciliation(ctx, 30_000, 10_000);
    expect(reconcile).toHaveBeenCalledTimes(4); // 0, 10, 20, 30 sn
    expect(ctx.pending.size).toBe(1);
  });

  it("Apify'da bitmedi / kullanım görünmüyor: beklemeye devam; işi bitmiş sonuçlar (ör. abonelik, bulunamadı) bekleyenlerden çıkar", async () => {
    const pendingOnes = makeCtx([{ outcome: "not_finished", apifyStatus: "RUNNING" }, { outcome: "usage_unavailable" }]);
    await settleReconciliation(pendingOnes.ctx, 10_000, 10_000);
    expect(pendingOnes.ctx.pending.size).toBe(1);

    for (const done of [{ outcome: "already_reconciled" }, { outcome: "subscription" }, { outcome: "not_found" }, { outcome: "no_external_run" }] as const) {
      const { ctx, sleep } = makeCtx([done]);
      await settleReconciliation(ctx, 60_000, 10_000);
      expect(ctx.pending.size, done.outcome).toBe(0);
      expect(sleep, done.outcome).not.toHaveBeenCalled();
    }
  });

  it("waitMs = 0: hiç deneme yapılmaz (ağ çağrısı yok)", async () => {
    const { ctx, reconcile } = makeCtx([settled]);
    await settleReconciliation(ctx, 0);
    expect(reconcile).not.toHaveBeenCalled();
    expect(ctx.pending.size).toBe(1);
  });

  it("okuma hatası turu düşürmez: nota yazılır, koşu bekleyende kalır", async () => {
    const { ctx } = makeCtx([new Error("Apify API 503")]);
    await expect(settleReconciliation(ctx, 20, 10)).resolves.toBeUndefined();
    expect(ctx.notes.join(" ")).toMatch(/Apify API 503/);
    expect(ctx.pending.size).toBe(1);
  });
});

/** `collection_runs` okuması: from → select → eq → in → order zinciri. */
function fakeRunsClient(rows: Record<string, unknown>[]) {
  const chain = { select: () => chain, eq: () => chain, in: () => chain, order: async () => ({ data: rows, error: null }) };
  return { from: () => chain };
}

describe("readRunReports", () => {
  const base = { kind: "content", target_label: "@a", status: "succeeded", item_count: 3, started_at: "2026-09-30T11:00:00.000Z" };

  it("gösterilen gerçek tutar yalnız KESİNLEŞMİŞ olandır; geçici tutar 'mutabakat bekliyor' sayılır (0 değil)", async () => {
    const { ctx } = makeCtx([settled]);
    ctx.deps = {
      ...ctx.deps,
      client: fakeRunsClient([
        { ...base, id: "run-1", billing: "metered", reserved_usd: 0.5, actual_usd: 0.03, usage_settled_at: "2026-09-30T11:05:00.000Z", external_run_id: "e1" },
        { ...base, id: "run-2", billing: "metered", reserved_usd: 0.4, actual_usd: 0.02, usage_settled_at: null, external_run_id: "e2" },
        { ...base, id: "run-3", billing: "metered", reserved_usd: 0.1, actual_usd: null, usage_settled_at: null, external_run_id: "e3" },
      ]),
    } as unknown as ResolvedDeps;
    ctx.runIds = ["run-1", "run-2", "run-3"];

    const { runs, cost } = await readRunReports(ctx);
    expect(runs.map((r) => r.actualUsd)).toEqual([0.03, undefined, undefined]);
    expect(cost).toEqual({ reservedUsd: 1, actualUsd: 0.03, pendingReconcile: 2 });
  });

  it("abonelik koşusu mutabakat bekleyen sayılmaz; hiç kesin tutar yoksa toplam actualUsd undefined", async () => {
    const { ctx } = makeCtx([settled]);
    ctx.deps = {
      ...ctx.deps,
      client: fakeRunsClient([{ ...base, id: "run-1", billing: "subscription", reserved_usd: 0, actual_usd: null, usage_settled_at: null, external_run_id: null }]),
    } as unknown as ResolvedDeps;
    const { cost } = await readRunReports(ctx);
    expect(cost).toEqual({ reservedUsd: 0, actualUsd: undefined, pendingReconcile: 0 });
  });
});
