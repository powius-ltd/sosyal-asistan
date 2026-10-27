import { describe, expect, it } from "vitest";

import type { DiscoverSummary } from "@/lib/collection/discover";
import { parseRequestJobInput } from "@/lib/data/job-input";
import type { PanelJob } from "@/lib/domain/panel-job";
import type { JobRunnerDeps } from "@/lib/job-runner/deps";
import { runJob } from "@/lib/job-runner/run-job";
import { approval, claimedJob, fakeDeps, fakeStore, NOW, WORKER_ID, WS_ID } from "@/lib/job-runner/test-support";
import type { ZernioMeasureResult } from "@/lib/outcomes/measure-zernio";

async function run(job: PanelJob, overrides: Partial<JobRunnerDeps> = {}) {
  const fake = fakeStore();
  const deps = fakeDeps(overrides);
  await runJob(job, { store: fake.store, deps, workerId: WORKER_ID, clock: () => NOW, clockMs: () => 0, echo: () => undefined, heartbeatMs: 60_000 });
  return { deps, fake, closing: fake.closing() };
}

const zernioResult = (overrides: Partial<ZernioMeasureResult> = {}): ZernioMeasureResult => ({
  outcome: "completed",
  dryRun: false,
  reels: 4,
  skipped: {},
  contentCreated: 1,
  contentExisting: 3,
  snapshotsInserted: 4,
  snapshotsUpdated: 0,
  snapshotsUnchanged: 0,
  notes: [],
  ...overrides,
});

const discoverSummary = (written: number): DiscoverSummary => ({
  outcome: "completed",
  sources: { related: { written: 0 }, coauthors: { found: 0, written: 0 }, search: { found: written, written, queries: [] } },
  enriched: 0,
  written,
  candidates: { total: written },
  cost: { reservedUsd: 0.05, actualUsd: 0.04, pendingReconcile: 0 },
  notes: [],
});

describe("istek şeması: halka uçları", () => {
  it("measure_zernio alansızdır, onay / tutar / önizleme kabul etmez", () => {
    expect(parseRequestJobInput({ kind: "measure_zernio" })).toMatchObject({ kind: "measure_zernio", dryRun: false, params: {} });
    for (const extra of [{ dryRun: true }, { approval: { basis: "one_time", maxUsd: 0.1 } }, { maxCredits: 5 }]) {
      expect(() => parseRequestJobInput({ kind: "measure_zernio", ...extra })).toThrow();
    }
  });

  it("discover tutar onayı olmadan açılmaz; onayla açılır; önizleme yok", () => {
    expect(() => parseRequestJobInput({ kind: "discover" })).toThrow();
    expect(() => parseRequestJobInput({ kind: "discover", dryRun: true })).toThrow();
    expect(parseRequestJobInput({ kind: "discover", approval: { basis: "one_time", maxUsd: 0.1 } })).toMatchObject({ kind: "discover", approval: { basis: "one_time", maxUsd: 0.1 } });
  });
});

describe("measure_zernio işi", () => {
  it("anahtar yoksa blocked + zernio_key_missing; ölçüm yazılmaz", async () => {
    const { deps, closing, fake } = await run(claimedJob({ kind: "measure_zernio" }));
    expect(deps.measureZernio).toHaveBeenCalledTimes(1);
    expect(deps.collect).not.toHaveBeenCalled();
    expect(closing).toMatchObject({ status: "blocked", result: { outcome: "zernio_key_missing" } });
    expect(fake.stepStatuses()).toEqual({ measure_zernio: "needs_approval" });
  });

  it("anahtar varsa onaysız koşar ($0); Apify'a gidilmez", async () => {
    const { deps, closing } = await run(claimedJob({ kind: "measure_zernio" }), { measureZernio: async () => ({ outcome: "measured", keyEnvName: "ZERNIO_API_KEY_TEST", result: zernioResult() }) });
    expect(closing).toMatchObject({ status: "succeeded", result: { exitCode: 0 } });
    expect(deps.measure).not.toHaveBeenCalled();
    expect(deps.collect).not.toHaveBeenCalled();
    expect(deps.measureZernio.mock.calls[0][1]).toMatchObject({ dryRun: false });
  });

  it("ölçülecek Reels yoksa temiz biter, kod no_reels", async () => {
    const { closing } = await run(claimedJob({ kind: "measure_zernio" }), { measureZernio: async () => ({ outcome: "measured", keyEnvName: "K", result: zernioResult({ reels: 0 }) }) });
    expect(closing).toMatchObject({ status: "succeeded", result: { outcome: "no_reels" } });
  });
});

describe("discover işi", () => {
  it("onaysız satırda keşif HİÇ çağrılmaz (Apify'a gidilmez)", async () => {
    const { deps, closing } = await run(claimedJob({ kind: "discover" }));
    expect(deps.discover).not.toHaveBeenCalled();
    expect(closing).toMatchObject({ status: "blocked", result: { outcome: "approval_missing" } });
  });

  it("onaylı satırda sahte bağımlılıkla koşar: maxUsd = satırdaki tutar, aday yazılır, izlenen rakip değişmez", async () => {
    const { deps, closing } = await run(claimedJob({ kind: "discover", approval: approval(0.12) }), { discover: async () => discoverSummary(3) });
    expect(deps.discover).toHaveBeenCalledTimes(1);
    expect(deps.discover.mock.calls[0][0]).toMatchObject({ workspaceId: WS_ID, maxUsd: 0.12, now: NOW });
    expect(closing).toMatchObject({ status: "succeeded", result: { exitCode: 0, spend: { actualUsd: 0.04 } } });
    // Keşif yalnız aday yazar; izlemeye alma / rakip ekleme bağımlılığı yoktur.
    expect(Object.keys(deps).filter((name) => /rival|competitor|track/i.test(name))).toEqual([]);
  });
});

describe("order işi", () => {
  it("istek: hafta zorunlu, slot / fikir isteğe bağlı; onay, kuru koşu ve bilinmeyen alan reddedilir", () => {
    expect(parseRequestJobInput({ kind: "order", week: "2026-10-19", slot: "P1" })).toMatchObject({ kind: "order", dryRun: false, params: { week: "2026-10-19", slot: "P1" } });
    for (const bad of [{}, { week: "2026-10-20" }, { week: "2026-10-19", dryRun: true }, { week: "2026-10-19", approval: { basis: "one_time", maxUsd: 0.1 } }, { week: "2026-10-19", slot: "../x" }, { week: "2026-10-19", dir: "/tmp" }]) {
      expect(() => parseRequestJobInput({ kind: "order", ...bad }), JSON.stringify(bad)).toThrow();
    }
  });

  it("fiş yazılınca başarı; parametreler işçiye aynen iner, Apify'a gidilmez", async () => {
    const written = { written: [{ orderId: "ornek-marka-2026-10-19-p1", path: "/x.md" }], skipped: [], planFound: true };
    const { deps, closing } = await run(claimedJob({ kind: "order", params: { week: "2026-10-19", slot: "P1" } }), { writeOrders: async () => written });
    expect(closing).toMatchObject({ status: "succeeded", result: { exitCode: 0 } });
    expect(deps.writeOrders.mock.calls[0][1]).toMatchObject({ week: "2026-10-19", slot: "P1" });
    expect(deps.collect).not.toHaveBeenCalled();
  });

  it("fiş zaten varsa üstüne yazılmaz ama iş başarıdır; plan yoksa no_plan", async () => {
    const exists = { written: [], skipped: [{ orderId: "a", slot: "P1", reason: "exists" }], planFound: true };
    expect((await run(claimedJob({ kind: "order", params: { week: "2026-10-19" } }), { writeOrders: async () => exists })).closing).toMatchObject({ status: "succeeded", result: { exitCode: 0 } });
    const none = await run(claimedJob({ kind: "order", params: { week: "2026-10-19" } }));
    expect(none.closing).toMatchObject({ status: "succeeded", result: { outcome: "no_plan" } });
  });
});

describe("order_return ve publish işleri", () => {
  it("istek: alansız, $0; onay / kuru koşu / ek alan reddedilir", () => {
    for (const kind of ["order_return", "publish"]) {
      expect(parseRequestJobInput({ kind })).toMatchObject({ kind, dryRun: false, params: {} });
      for (const extra of [{ dryRun: true }, { approval: { basis: "one_time", maxUsd: 0.1 } }, { maxCredits: 5 }, { dir: "/tmp" }]) {
        expect(() => parseRequestJobInput({ kind, ...extra }), `${kind} ${JSON.stringify(extra)}`).toThrow();
      }
    }
  });

  it("order_return: açılan satır başarıdır; dönen video yoksa nothing_to_do", async () => {
    const done = { outcome: "done" as const, result: { opened: ["s1"], drafts: [], skipped: [], alreadyHandled: 0 } };
    const ok = await run(claimedJob({ kind: "order_return" }), { returnOrders: async () => done });
    expect(ok.closing).toMatchObject({ status: "succeeded", result: { exitCode: 0 } });
    const none = await run(claimedJob({ kind: "order_return" }), { returnOrders: async () => ({ outcome: "done", result: { opened: [], drafts: [], skipped: [], alreadyHandled: 2 } }) });
    expect(none.closing).toMatchObject({ status: "succeeded", result: { outcome: "nothing_to_do" } });
    expect(ok.deps.collect).not.toHaveBeenCalled();
  });

  it("publish: anahtar yoksa blocked + zernio_key_missing; zamanlanınca başarı; hata varsa partial/failed", async () => {
    const blocked = await run(claimedJob({ kind: "publish" }), { publishOrders: async () => ({ outcome: "key_missing" }) });
    expect(blocked.closing).toMatchObject({ status: "blocked", result: { outcome: "zernio_key_missing" } });
    const result = (over: Record<string, unknown>) => ({ outcome: "done" as const, result: { scheduled: [], published: [], failed: [], stuck: [], unconfirmed: [], manual: [], unverified: [], waiting: 0, ...over } });
    const ok = await run(claimedJob({ kind: "publish" }), { publishOrders: async () => result({ scheduled: ["s1"] }) });
    expect(ok.closing).toMatchObject({ status: "succeeded" });
    const partial = await run(claimedJob({ kind: "publish" }), { publishOrders: async () => result({ scheduled: ["s1"], failed: [{ orderId: "s2", code: "schedule_in_past" }] }) });
    expect(partial.closing).toMatchObject({ status: "partial", result: { outcome: "step_failed" } });
    const failed = await run(claimedJob({ kind: "publish" }), { publishOrders: async () => result({ failed: [{ orderId: "s2", code: "approval_stale" }] }) });
    expect(failed.closing).toMatchObject({ status: "failed" });
    const waitingOnly = await run(claimedJob({ kind: "publish" }), { publishOrders: async () => result({ waiting: 2 }) });
    expect(waitingOnly.closing).toMatchObject({ status: "succeeded", result: { outcome: "nothing_to_do" } });
    const idle = await run(claimedJob({ kind: "publish" }));
    expect(idle.closing).toMatchObject({ status: "succeeded", result: { outcome: "nothing_to_do" } });
  });
});
