/**
 * İşçinin kredi kapısı ve kapanışı (SAHTE adımlar + sahte defter): zorlama açık / kapalı, ayırması olmayan iş, yetersiz kredi, kısmi
 * (ayrılan yarıda biter), başarısız birim, iptal, işçi kaybı, çift kesinleştirme, yazılamayan kapanış, önizleme. Hiçbir gerçek çağrı yok.
 */
import { describe, expect, it } from "vitest";

import { RepositoryError } from "@/lib/data/repository";
import { CREDIT_PRICE_VERSION } from "@/lib/domain/credit-pricing";
import type { PanelJob } from "@/lib/domain/panel-job";
import type { AnalyzeArgs } from "@/lib/intel/args";
import type { JobRunnerDeps } from "@/lib/job-runner/deps";
import { runJob } from "@/lib/job-runner/run-job";
import { analyzeSummary, approval, claimedJob, collectSummary, creditApproval, fakeCredits, fakeDeps, fakeStore, NOW, planResult, WORKER_ID, type FakeCredits, type FakeStore } from "@/lib/job-runner/test-support";
import { runWorker } from "@/lib/job-runner/worker";

const JOB_ID = claimedJob().id;

async function run(job: PanelJob, credits: FakeCredits, overrides: Partial<JobRunnerDeps> = {}, arrange?: (fake: FakeStore) => void) {
  const fake = fakeStore();
  arrange?.(fake);
  const deps = fakeDeps(overrides);
  const log: string[] = [];
  const result = await runJob(job, { store: fake.store, deps, credits: credits.port, workerId: WORKER_ID, clock: () => NOW, clockMs: () => 0, echo: (line) => log.push(line), heartbeatMs: 60_000 });
  return { fake, deps, result, log, closing: fake.closing() };
}

/** Krediye bağlı (yalnız kredi onaylı) iş + açık ayırması. */
const bound = (kind: PanelJob["kind"], maxCredits: number, patch: Partial<PanelJob> = {}) => ({
  job: claimedJob({ kind, approval: creditApproval(maxCredits), ...patch }),
  credits: fakeCredits({ enforced: true, open: { [JOB_ID]: maxCredits } }),
});

describe("zorlama KAPALI: bugünkü davranış", () => {
  it("krediye bağlı olmayan iş koşar; defter HİÇ çağrılmaz; sonuçta kredi alanı yok", async () => {
    const credits = fakeCredits({ enforced: false });
    const { deps, closing } = await run(claimedJob({ kind: "analyze" }), credits);
    expect(deps.analyze).toHaveBeenCalledTimes(1);
    expect(deps.analyze.mock.calls[0][1].limit, "panel tavanı değişmez").toBe(19);
    expect(closing).toMatchObject({ status: "succeeded" });
    expect((closing?.result as { credits?: unknown }).credits).toBeUndefined();
    expect([credits.lookups, credits.settled, credits.released]).toEqual([[], [], []]);
  });

  it("kredi bağlaması hiç verilmezse de (eski çağıranlar) krediye bağlı olmayan iş koşar", async () => {
    const fake = fakeStore();
    const deps = fakeDeps();
    const result = await runJob(claimedJob({ kind: "plan" }), { store: fake.store, deps, workerId: WORKER_ID, clock: () => NOW, heartbeatMs: 60_000 });
    expect(deps.plan).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("succeeded");
  });

  it("zorlama kapalıyken de satırında kredi tavanı olan işin ayırması kapatılır (ayırma açık kalmaz)", async () => {
    const credits = fakeCredits({ enforced: false, open: { [JOB_ID]: 4 } });
    const { closing } = await run(claimedJob({ kind: "briefing", approval: creditApproval(4) }), credits);
    expect(closing).toMatchObject({ status: "succeeded", result: { credits: { reserved: 4, due: 4, charged: 4 } } });
    expect(credits.hold()?.status).toBe("settled");
  });
});

describe("zorlama AÇIK: ayırması olmayan iş koşturulmaz", () => {
  it("satırda kredi tavanı yok: iş blocked + insufficient_credits; bakım dahil hiçbir işlev çağrılmaz", async () => {
    const credits = fakeCredits({ enforced: true });
    for (const kind of ["analyze", "plan", "briefing", "routine"] as const) {
      const { deps, closing } = await run(claimedJob({ kind }), credits);
      expect(closing, kind).toMatchObject({ status: "blocked", result: { outcome: "insufficient_credits" } });
      for (const name of ["createContext", "housekeeping", "analyze", "plan", "briefing", "routineDeps", "collect", "measure"] as const) expect(deps[name], `${kind}: ${name}`).not.toHaveBeenCalled();
    }
    expect([credits.settled, credits.released]).toEqual([[], []]);
  });

  it("ayırma yok / bırakılmış / kesinleşmiş: iş koşturulmaz ve kapanmış ayırmaya dokunulmaz", async () => {
    const missing = fakeCredits({ enforced: true });
    expect((await run(claimedJob({ kind: "plan", approval: creditApproval(60) }), missing)).closing).toMatchObject({ status: "blocked", result: { outcome: "insufficient_credits" } });

    const released = fakeCredits({ enforced: true, open: { [JOB_ID]: 60 } });
    released.releaseOutside();
    const { deps, closing } = await run(claimedJob({ kind: "plan", approval: creditApproval(60) }), released);
    expect(deps.plan).not.toHaveBeenCalled();
    expect(closing).toMatchObject({ status: "blocked", result: { outcome: "insufficient_credits" } });
    expect([released.settled, released.released]).toEqual([[], []]);
  });

  it("kredi harcamayan tür (açı etiketi) ve önizleme zorlamada da ayırmasız koşar; defter çağrılmaz", async () => {
    const credits = fakeCredits({ enforced: true });
    const label = await run(claimedJob({ kind: "label" }), credits);
    expect(label.deps.label).toHaveBeenCalledTimes(1);
    expect(label.closing).toMatchObject({ status: "succeeded" });
    const preview = await run(claimedJob({ kind: "collect", dryRun: true }), credits);
    expect(preview.deps.collect.mock.calls[0][0]).toMatchObject({ dryRun: true });
    expect(preview.closing).toMatchObject({ status: "succeeded" });
    expect([credits.lookups, credits.settled, credits.released]).toEqual([[], [], []]);
  });
});

describe("kesinleştirme: yapılan birim kadar düşülür", () => {
  it("inceleme: tamamlanan video × fiyat düşer, fark serbest kalır; birim sayısı ve fiyat sürümü deftere gider", async () => {
    const { job, credits } = bound("analyze", 190);
    const { closing, deps } = await run(job, credits, { analyze: async () => analyzeSummary({ selected: 7, ok: 2, insufficient: 1, failed: 4 }) });
    expect(deps.analyze.mock.calls[0][1].limit).toBe(19);
    expect(credits.settled).toEqual([{ key: `job:${JOB_ID}`, actual: 30, units: { video_review: 3 }, priceVersion: CREDIT_PRICE_VERSION }]);
    expect(closing?.result).toMatchObject({ credits: { reserved: 190, due: 30, charged: 30, units: { video_review: 3 }, priceVersion: CREDIT_PRICE_VERSION } });
    expect(credits.hold()).toMatchObject({ status: "settled", charged: 30 });
  });

  it("plan ve notlar: üretildiyse bir birim; mevcut plan korunduysa (üretilemedi) düşülmez, ayırma bırakılır", async () => {
    const plan = bound("plan", 60);
    expect((await run(plan.job, plan.credits)).closing?.result).toMatchObject({ credits: { due: 60, charged: 60, units: { weekly_plan: 1 } } });

    const kept = bound("plan", 60);
    const { closing } = await run(kept.job, kept.credits, { plan: async () => planResult({ outcome: "kept_existing" }) });
    expect(closing).toMatchObject({ status: "blocked", result: { outcome: "kept_existing", credits: { reserved: 60, due: 0, charged: 0 } } });
    expect([kept.credits.settled, kept.credits.released]).toEqual([[], [`job:${JOB_ID}`]]);
    expect(kept.credits.hold()?.status).toBe("released");

    const brief = bound("briefing", 4);
    expect((await run(brief.job, brief.credits)).closing?.result).toMatchObject({ credits: { due: 4, charged: 4, units: { briefing: 1 } } });
  });

  it("toplama: USD onayı + kredi tavanı birlikte; içeriği alınan hesap sayısı kadar düşer", async () => {
    const credits = fakeCredits({ enforced: true, open: { [JOB_ID]: 40 } });
    const job = claimedJob({ kind: "collect", approval: { ...approval(0.2), maxCredits: 40 } });
    const { deps, closing } = await run(job, credits);
    expect(deps.collectTargetCount).toHaveBeenCalledTimes(1);
    expect(deps.collect.mock.calls[0][0]).toMatchObject({ maxUsd: 0.2, dryRun: false });
    expect(closing).toMatchObject({ status: "succeeded", result: { credits: { reserved: 40, due: 8, charged: 8, units: { account_scan: 1 } } } });
  });

  it("beklenmeyen hata: iş failed; tamamlanan birim yoksa kredi düşülmez, ayırma bırakılır", async () => {
    const { job, credits } = bound("analyze", 190);
    const { closing } = await run(job, credits, {
      analyze: async () => {
        throw new Error("arka uç düştü");
      },
    });
    expect(closing).toMatchObject({ status: "failed", result: { outcome: "error", credits: { reserved: 190, due: 0, charged: 0 } } });
    expect(credits.hold()?.status).toBe("released");
  });
});

describe("yetersiz kredi ve ayrılanın yarıda bitmesi", () => {
  it("adım ayrılan krediye sığmıyorsa HİÇ başlamaz: blocked + insufficient_credits; ayırma bırakılır", async () => {
    const plan = bound("plan", 30);
    const first = await run(plan.job, plan.credits);
    expect(first.deps.plan).not.toHaveBeenCalled();
    expect(first.closing).toMatchObject({ status: "blocked", result: { outcome: "insufficient_credits", credits: { reserved: 30, due: 0, charged: 0 } } });
    expect(first.fake.stepStatuses()).toEqual({ plan: "needs_approval" });
    expect(plan.credits.hold()?.status).toBe("released");

    // Toplama: 4 hesap × 8 = 32 kredi gerekir, 16 ayrılmış: Apify'a HİÇ gidilmez.
    const credits = fakeCredits({ enforced: true, open: { [JOB_ID]: 16 } });
    const collect = await run(claimedJob({ kind: "collect", approval: { ...approval(0.2), maxCredits: 16 } }), credits);
    expect(collect.deps.collect).not.toHaveBeenCalled();
    expect(collect.closing).toMatchObject({ status: "blocked", result: { outcome: "insufficient_credits" } });
  });

  it("inceleme kalan krediye sığan video sayısıyla sınırlanır; sığmayan video kaldıysa iş partial + credits_exhausted, yapılan düşer", async () => {
    const { job, credits } = bound("analyze", 25);
    const analyze = async (_ctx: unknown, args: AnalyzeArgs) => analyzeSummary({ selected: args.limit, ok: args.limit, skippedByCap: 5 });
    const { deps, closing } = await run(job, credits, { analyze });
    expect(deps.analyze.mock.calls[0][1].limit, "25 krediye 2 video sığar").toBe(2);
    expect(closing).toMatchObject({ status: "partial", result: { outcome: "credits_exhausted", credits: { reserved: 25, due: 20, charged: 20, units: { video_review: 2 } } } });
    expect(credits.hold()).toMatchObject({ status: "settled", charged: 20 });
  });

  it("kredi tavanı panel tavanının altında ama seçilecek video kalmadıysa iş temiz biter (kredi bitti sayılmaz)", async () => {
    const { job, credits } = bound("analyze", 50);
    const { closing } = await run(job, credits, { analyze: async () => analyzeSummary({ selected: 3, ok: 3, skippedByCap: 0 }) });
    expect(closing).toMatchObject({ status: "succeeded", result: { credits: { due: 30, charged: 30 } } });
  });
});

describe("iptal, işçi kaybı, çift kesinleştirme", () => {
  /** `total` videoyu sırayla "inceler"; her videodan sonra sayacı yazar ve durmayı sorar. */
  const queue = (total: number) => async (_ctx: unknown, args: AnalyzeArgs) => {
    let done = 0;
    for (let video = 1; video <= total && (await args.shouldStop?.()) !== true; video++) {
      done = video;
      await args.onProgress?.({ done, total });
    }
    return analyzeSummary({ selected: total, ok: done, skippedByCap: total - done });
  };
  const atProgress = (fake: FakeStore, done: number, trigger: () => void) =>
    fake.onPatch((patch) => {
      if ((patch.progress as { done: number } | null | undefined)?.done === done) trigger();
    });

  it("iptal: iş cancelled; yapılan iş kalır ve o kadarı düşülür (başlamayan video düşülmez)", async () => {
    const { job, credits } = bound("analyze", 190);
    const { closing } = await run(job, credits, { analyze: queue(5) }, (fake) => atProgress(fake, 2, () => fake.requestCancel()));
    expect(closing).toMatchObject({ status: "cancelled", result: { credits: { reserved: 190, due: 20, charged: 20, units: { video_review: 2 } } } });
    expect(credits.hold()).toMatchObject({ status: "settled", charged: 20 });
  });

  it("işçi kaybı: DB işi kapatıp ayırmayı bırakmışsa işçi düşemez; hata fırlatmaz, uyuşmazlık günlüğe yazılır", async () => {
    const { job, credits } = bound("analyze", 190);
    const { result, log, closing } = await run(job, credits, { analyze: queue(4) }, (fake) =>
      atProgress(fake, 1, () => {
        fake.loseFence();
        credits.releaseOutside(); // `close_stale_panel_jobs`: iş `worker_lost`, ayırma bırakıldı
      }),
    );
    expect(result).toEqual({ lost: true, abandoned: false });
    expect(closing, "çit kaybında kapanış yazılamaz").toBeUndefined();
    expect(credits.settled).toHaveLength(1);
    expect(credits.hold(), "bırakılmış ayırma kesinleşmedi: kredi düşülmedi").toMatchObject({ status: "released" });
    expect(log.some((line) => line.includes("kredi kapanışı yazılamadı"))).toBe(true);
  });

  it("çift kesinleştirme: ayırma daha önce BAŞKA tutarla kapanmışsa ilk sonuç geçerlidir; uyuşmazlık günlüğe ve sonuca yazılır", async () => {
    const { job, credits } = bound("analyze", 190);
    await credits.port.settle({ key: `job:${JOB_ID}`, actual: 20, units: { video_review: 2 }, priceVersion: CREDIT_PRICE_VERSION });
    credits.settled.length = 0;
    // Ayırma kapandığı için iş normalde koşturulmaz; kapanış yarışını sınamak için açılış "açık" görsün.
    credits.port.findHold = async () => ({ id: "hold", key: `job:${JOB_ID}`, amount: 190, status: "open", createdAt: NOW.toISOString() });
    const { closing, log } = await run(job, credits, { analyze: async () => analyzeSummary({ selected: 3, ok: 3 }) });
    expect(credits.settled).toEqual([expect.objectContaining({ actual: 30 })]);
    expect(closing?.result).toMatchObject({ credits: { due: 30, charged: 20 } });
    expect(log.some((line) => line.includes("kredi uyuşmazlığı") && line.includes("30") && line.includes("20"))).toBe(true);
    expect(credits.hold(), "ikinci kez düşülmedi").toMatchObject({ status: "settled", charged: 20 });
  });

  it("kapanış yazılamazsa (geçici DB hatası) iş yine kapanır; borç sonuçta kalır (düşülen yok: süpürme kapatır)", async () => {
    const { job, credits } = bound("briefing", 4);
    credits.port.settle = async () => {
      throw new RepositoryError("invalid_state", "bağlantı koptu");
    };
    const { closing, log } = await run(job, credits);
    expect(closing).toMatchObject({ status: "succeeded", result: { credits: { reserved: 4, due: 4, units: { briefing: 1 } } } });
    expect((closing?.result as { credits: { charged?: number } }).credits.charged, "düşülmedi: 0 yazılmaz").toBeUndefined();
    expect(log.some((line) => line.includes("kredi kapanışı yazılamadı (4 kredi düşülecekti)"))).toBe(true);
  });

  it("toplama: tamamlanmayan koşu (engellendi) düşülmez", async () => {
    const credits = fakeCredits({ enforced: true, open: { [JOB_ID]: 40 } });
    const job = claimedJob({ kind: "collect", approval: { ...approval(0.05), maxCredits: 40 } });
    const { closing } = await run(job, credits, { collect: async (options) => collectSummary(options) });
    expect(closing).toMatchObject({ status: "blocked", result: { outcome: "over_approved_amount", credits: { due: 0, charged: 0 } } });
    expect(credits.hold()?.status).toBe("released");
  });
});

describe("işçi başı süpürme", () => {
  it("yalnız kendi kuyruğu için çağrılır; hata işçiyi düşürmez; bağlama yoksa hiç çağrılmaz", async () => {
    const credits = fakeCredits({ enforced: true });
    const fake = fakeStore();
    const log: string[] = [];
    credits.port.sweep = async (queue) => (queue === "test_queue" ? 2 : 0);
    const result = await runWorker({ mode: "drain", queue: "test_queue", store: fake.store, deps: fakeDeps(), credits: credits.port, log: (line) => log.push(line) });
    expect(result).toMatchObject({ code: 0, jobs: 0 });
    expect(log).toContain("Açık kalmış kredi ayırması kapatıldı: 2.");

    credits.port.sweep = async () => {
      throw new Error("db yok");
    };
    const failed = await runWorker({ mode: "drain", queue: "test_queue", store: fakeStore().store, deps: fakeDeps(), credits: credits.port, log: (line) => log.push(line) });
    expect(failed.code).toBe(0);
    expect(log.some((line) => line.includes("açık kredi ayırmaları süpürülemedi"))).toBe(true);
    expect((await runWorker({ mode: "drain", queue: "test_queue", store: fakeStore().store, deps: fakeDeps() })).code).toBe(0);
  });
});
