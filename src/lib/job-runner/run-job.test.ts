import { describe, expect, it, vi } from "vitest";

import { JOB_SPEND_MAX_USD, type PanelJob } from "@/lib/domain/panel-job";
import type { JobRunnerDeps } from "@/lib/job-runner/deps";
import { runJob } from "@/lib/job-runner/run-job";
import { analyzeSummary, approval, claimedJob, collectSummary, fakeDeps, fakeStore, measureResult, NOW, planResult, USER_ID, WORKER_ID, WS_ID } from "@/lib/job-runner/test-support";
import { LlmError } from "@/lib/llm/types";

async function run(job: PanelJob, overrides: Partial<JobRunnerDeps> = {}, options: { clock?: () => Date; timeoutMs?: number; hardGraceMs?: number } = {}) {
  const fake = fakeStore();
  const deps = fakeDeps(overrides);
  const log: string[] = [];
  const result = await runJob(job, { store: fake.store, deps, workerId: WORKER_ID, clock: options.clock ?? (() => NOW), clockMs: () => 0, echo: (line) => log.push(line), heartbeatMs: 60_000, ...options });
  return { fake, deps, result, log, closing: fake.closing() };
}

/** Para / kota harcayan ya da yazan her işlev (önizlemede hiçbiri çağrılmamalı; `collect` / `measure` yalnız kuru koşuyla). */
const SIDE_EFFECTS = ["housekeeping", "analyze", "label", "plan", "briefing", "cluster", "routineDeps", "writePlanMarkdown"] as const;

describe("harcama kapısı: toplama", () => {
  it("onaysız satırda collectOnce HİÇ çağrılmaz; iş blocked", async () => {
    const { deps, closing, fake } = await run(claimedJob({ kind: "collect" }));
    expect(deps.collect).not.toHaveBeenCalled();
    expect(closing).toMatchObject({ status: "blocked", result: { outcome: "approval_missing" } });
    expect(fake.stepStatuses()).toEqual({ collect: "needs_approval" });
  });

  it("24 saatten eski onay harcatmaz: collectOnce çağrılmaz, approval_expired", async () => {
    const { deps, closing } = await run(claimedJob({ kind: "collect", approval: approval(0.2, 24 * 60 + 1) }));
    expect(deps.collect).not.toHaveBeenCalled();
    expect(closing).toMatchObject({ status: "blocked", result: { outcome: "approval_expired" } });
  });

  it("onaylı satırda collectOnce TEK kez, maxUsd = satırdaki tutar (varsayılan / ortam değil)", async () => {
    const { deps, closing } = await run(claimedJob({ kind: "collect", approval: approval(0.17), params: { limit: 7 } }));
    expect(deps.collect).toHaveBeenCalledTimes(1);
    expect(deps.collect.mock.calls[0][0]).toMatchObject({ workspaceId: WS_ID, maxUsd: 0.17, dryRun: false, limit: 7, now: NOW });
    expect(closing).toMatchObject({ status: "succeeded", result: { exitCode: 0, spend: { reservedUsd: 0.11, actualUsd: 0.1 } } });
  });

  it("tahmin onaylı tutarı aşarsa (collectOnce blocked) iş blocked + over_approved_amount; tahmin sonuca girer", async () => {
    const { deps, closing, fake } = await run(claimedJob({ kind: "collect", approval: approval(0.05) }));
    expect(deps.collect.mock.calls[0][0].maxUsd).toBe(0.05);
    expect(closing).toMatchObject({ status: "blocked", result: { outcome: "over_approved_amount", estimate: { usd: 0.11 } } });
    expect(fake.stepStatuses()).toEqual({ collect: "needs_approval" });
  });
});

describe("harcama kapısı: ölçüm", () => {
  it("onaysız ya da eskimiş onayda measureOnce HİÇ çağrılmaz", async () => {
    for (const given of [undefined, approval(0.05, 25 * 60)]) {
      const { deps, closing } = await run(claimedJob({ kind: "measure", approval: given }));
      expect(deps.measure).not.toHaveBeenCalled();
      expect(deps.collect).not.toHaveBeenCalled();
      expect(closing?.status).toBe("blocked");
    }
  });

  it("tek seferlik onay: maxUsd = satırdaki tutar; aylık tavan dayanağı: tutar verilmez (kural çalışma alanının onaylı tavanı)", async () => {
    const completed = measureResult({ outcome: "completed", dryRun: false, collect: collectSummary({ maxUsd: 0.05 }, 0.04) });
    const oneTime = await run(claimedJob({ kind: "measure", approval: approval(0.05) }), { measure: async () => completed });
    expect(oneTime.deps.measure.mock.calls[0][0]).toMatchObject({ workspaceId: WS_ID, maxUsd: 0.05, dryRun: false });
    expect(oneTime.closing?.status).toBe("succeeded");

    const monthly = await run(claimedJob({ kind: "measure", approval: { basis: "monthly_cap", approvedBy: USER_ID, approvedAt: NOW.toISOString() } }), {
      measure: async () => measureResult({ outcome: "refused", dryRun: false, decision: { allowed: false, reason: "Aylık ölçüm tavanında kalan hak yetmiyor." } }),
    });
    expect(monthly.deps.measure.mock.calls[0][0].maxUsd).toBeUndefined();
    expect(monthly.closing).toMatchObject({ status: "blocked", result: { outcome: "budget_refused" } });
  });
});

describe("önizleme: yazma / LLM / Apify koşusu yok", () => {
  it("toplama önizlemesi: yalnız kuru koşu çağrılır; bakım dahil hiçbir yan etkili işlev çağrılmaz; tahmin sonuçta", async () => {
    const { deps, closing } = await run(claimedJob({ kind: "collect", dryRun: true, params: { limit: 5 } }));
    expect(deps.collect).toHaveBeenCalledTimes(1);
    expect(deps.collect.mock.calls[0][0]).toMatchObject({ dryRun: true, limit: 5, maxUsd: JOB_SPEND_MAX_USD });
    expect(deps.measure).not.toHaveBeenCalled();
    for (const name of SIDE_EFFECTS) expect(deps[name], name).not.toHaveBeenCalled();
    expect(closing).toMatchObject({ status: "succeeded", result: { exitCode: 0, estimate: { usd: 0.11 } } });
    expect((closing?.result as { spend?: unknown }).spend, "önizlemede harcama yok").toBeUndefined();
  });

  it("ölçüm önizlemesi: yalnız kuru koşu (tutar verilmez); onay kuralının reddi hüküm değildir", async () => {
    const { deps, closing } = await run(claimedJob({ kind: "measure", dryRun: true }), {
      measure: async (options) => measureResult({ outcome: "refused", dryRun: options.dryRun, decision: { allowed: false, reason: "Aylık ölçüm tavanı onaylı değil." } }),
    });
    expect(deps.measure).toHaveBeenCalledTimes(1);
    expect(deps.measure.mock.calls[0][0]).toMatchObject({ dryRun: true });
    expect(deps.measure.mock.calls[0][0].maxUsd).toBeUndefined();
    expect(deps.collect).not.toHaveBeenCalled();
    for (const name of SIDE_EFFECTS) expect(deps[name], name).not.toHaveBeenCalled();
    expect(closing).toMatchObject({ status: "succeeded", result: { estimate: { usd: 0.04 } } });
  });

  it("önizlemesi olmayan türde kuru koşu satırı koşturulmaz (gerçek işe dönmez)", async () => {
    const { deps, closing } = await run(claimedJob({ kind: "analyze", dryRun: true }));
    expect(deps.analyze).not.toHaveBeenCalled();
    expect(deps.createContext).not.toHaveBeenCalled();
    expect(closing).toMatchObject({ status: "failed", result: { outcome: "error" } });
  });
});

describe("tek adımlı iş: adım yazımı, hata, iptal", () => {
  it("adım sırayla yazılır: sırada → sürüyor → tamam → kapanış; gerçek işte bakım çağrılır", async () => {
    const { fake, deps, closing, result } = await run(claimedJob({ kind: "analyze" }));
    expect(fake.timeline()).toEqual([["analyze:pending"], ["analyze:running"], ["analyze:ok"], ["analyze:ok"]]);
    expect(deps.housekeeping).toHaveBeenCalledTimes(1);
    expect(deps.housekeeping.mock.calls[0][0]).toMatchObject({ workspaceId: WS_ID, now: NOW });
    expect(deps.analyze.mock.calls[0][1]).toMatchObject({ pilot: false, dryRun: false });
    expect(closing).toMatchObject({ status: "succeeded", current_step: null, progress: null, finished_at: NOW.toISOString() });
    expect(result).toEqual({ status: "succeeded", lost: false, abandoned: false });
  });

  it("plan: hafta parametresi satırdan; markdown yazılır; mevcut plan korunduysa blocked + kept_existing", async () => {
    const saved = await run(claimedJob({ kind: "plan", params: { week: "2026-10-12" } }), { writePlanMarkdown: () => "docs/haftalik-plan/test/2026-10-12.md" });
    expect(saved.deps.plan.mock.calls[0][1]).toEqual({ week: "2026-10-12", dryRun: false });
    expect(saved.deps.writePlanMarkdown).toHaveBeenCalledTimes(1);
    expect(saved.closing?.status).toBe("succeeded");
    const kept = await run(claimedJob({ kind: "plan" }), { plan: async () => planResult({ outcome: "kept_existing", status: undefined }) });
    expect(kept.deps.plan.mock.calls[0][1]).toEqual({ week: undefined, dryRun: false });
    expect(kept.closing).toMatchObject({ status: "blocked", result: { outcome: "kept_existing" } });
  });

  it("beklenmeyen hata: adım failed, iş failed + error, hata metni satırda; yazı aracı kalıcı hatası: blocked + llm_unavailable", async () => {
    const thrown = await run(claimedJob({ kind: "label" }), {
      label: async () => {
        throw new Error("DB yazımı düştü");
      },
    });
    expect(thrown.fake.stepStatuses()).toEqual({ label: "failed" });
    expect(thrown.closing).toMatchObject({ status: "failed", result: { outcome: "error" }, error: "DB yazımı düştü" });
    const llm = await run(claimedJob({ kind: "plan" }), {
      plan: async () => {
        throw new LlmError("spawn_failed", "claude bulunamadı");
      },
    });
    expect(llm.closing).toMatchObject({ status: "blocked", result: { outcome: "llm_unavailable" } });
  });

  it("eksik ortam değişkeni: yalnız ADI yazılır, bağlam kurulmaz, iş koşturulmaz", async () => {
    const { deps, closing } = await run(claimedJob({ kind: "collect", approval: approval(0.2) }), { missingEnv: (names) => [...names] });
    expect(deps.missingEnv.mock.calls[0][0]).toEqual(["APIFY_TOKEN"]);
    expect(deps.createContext).not.toHaveBeenCalled();
    expect(deps.collect).not.toHaveBeenCalled();
    expect(closing).toMatchObject({ status: "failed", error: "Eksik ortam değişkeni (.env.local): APIFY_TOKEN" });
  });

  it("bağlam başka çalışma alanına çözülürse iş koşturulmaz", async () => {
    const { deps, closing } = await run(claimedJob({ kind: "briefing" }), { createContext: async (now) => ({ workspaceId: "baska", workspace: { name: "x" }, now }) as never });
    expect(deps.briefing).not.toHaveBeenCalled();
    expect(closing?.status).toBe("failed");
  });

  it("iş alınır alınmaz durdurulduysa adım hiç başlamaz: cancelled, adım sırada kalır", async () => {
    const fake = fakeStore();
    fake.requestCancel();
    const deps = fakeDeps();
    await runJob(claimedJob({ kind: "briefing" }), { store: fake.store, deps, workerId: WORKER_ID, clock: () => NOW, heartbeatMs: 60_000 });
    expect(deps.briefing).not.toHaveBeenCalled();
    expect(fake.closing()).toMatchObject({ status: "cancelled", result: null });
    expect(fake.stepStatuses()).toEqual({ briefing: "pending" });
  });

  it("çalışan tek adım kesilmez: adım sırasında gelen iptal işi tamamlanmış sayar", async () => {
    const fake = fakeStore();
    const deps = fakeDeps({
      briefing: async () => {
        fake.requestCancel();
        return { ok: true, briefingId: "b", runId: "r", items: [], basis: {} as never, attempts: 1, seconds: 1, factsBytes: 1, omitted: {} };
      },
    });
    await runJob(claimedJob({ kind: "briefing" }), { store: fake.store, deps, workerId: WORKER_ID, clock: () => NOW, heartbeatMs: 60_000 });
    expect(fake.closing()?.status).toBe("succeeded");
  });
});

describe("video inceleme: sayaç ve videolar arası durma", () => {
  /** `runAnalysis` kuyruğunun kanca sözleşmesi: başta ve her video bitince sayaç + durma sorusu; durunca kalanlar başlatılmaz. */
  const queue = (total: number, started: number[]): JobRunnerDeps["analyze"] => async (_ctx, args) => {
    await args.onProgress?.({ done: 0, total });
    let stopped = (await args.shouldStop?.()) === true;
    let done = 0;
    for (let video = 1; video <= total && !stopped; video++) {
      started.push(video);
      done = video;
      await args.onProgress?.({ done, total });
      stopped = (await args.shouldStop?.()) === true;
    }
    return analyzeSummary({ selected: total, ok: done, skippedByCap: total - done });
  };

  it("sayaç satıra yazılır; iptalden sonra yeni video BAŞLAMAZ; iş cancelled, yapılan iş kalır", async () => {
    const fake = fakeStore();
    const started: number[] = [];
    // İkinci videonun sayacı yazılırken durdurma isteği gelir.
    fake.onPatch((patch) => {
      if ((patch.progress as { done: number } | null | undefined)?.done === 2) fake.requestCancel();
    });
    const deps = fakeDeps({ analyze: queue(5, started) });
    const result = await runJob(claimedJob({ kind: "analyze" }), { store: fake.store, deps, workerId: WORKER_ID, clock: () => NOW, heartbeatMs: 60_000 });
    expect(started).toEqual([1, 2]);
    expect(fake.patches.flatMap((patch) => (patch.progress ? [patch.progress] : []))).toEqual([{ done: 0, total: 5 }, { done: 1, total: 5 }, { done: 2, total: 5 }]);
    expect(fake.closing()).toMatchObject({ status: "cancelled", progress: null });
    expect(fake.stepStatuses()).toEqual({ analyze: "ok" });
    expect(result.status).toBe("cancelled");
  });

  it("süre tavanı (yumuşak): sınırdan sonra yeni video başlamaz; iş failed + timeout", async () => {
    let now = NOW;
    const started: number[] = [];
    const fake = fakeStore();
    fake.onPatch((patch) => {
      if ((patch.progress as { done: number } | null | undefined)?.done === 1) now = new Date(NOW.getTime() + 5_000);
    });
    const deps = fakeDeps({ analyze: queue(4, started) });
    await runJob(claimedJob({ kind: "analyze" }), { store: fake.store, deps, workerId: WORKER_ID, clock: () => now, heartbeatMs: 60_000, timeoutMs: 1_000 });
    expect(started).toEqual([1]);
    expect(fake.closing()).toMatchObject({ status: "failed", result: { outcome: "timeout" } });
  });

  it("çit kaybı: yeni video başlamaz, kapanış yazılamaz, sonuç lost", async () => {
    const fake = fakeStore();
    const started: number[] = [];
    fake.onPatch((patch) => {
      if ((patch.progress as { done: number } | null | undefined)?.done === 1) fake.loseFence();
    });
    const deps = fakeDeps({ analyze: queue(4, started) });
    const result = await runJob(claimedJob({ kind: "analyze" }), { store: fake.store, deps, workerId: WORKER_ID, clock: () => NOW, heartbeatMs: 60_000 });
    expect(started).toEqual([1]);
    expect(fake.closing()).toBeUndefined();
    expect(result).toEqual({ lost: true, abandoned: false });
  });
});

describe("sert süre tavanı", () => {
  it("çalışan adım pay süresinde de bitmezse iş failed + timeout yazılır ve abandoned döner", async () => {
    const { closing, result } = await run(claimedJob({ kind: "label" }), { label: () => new Promise(() => undefined) }, { timeoutMs: 5, hardGraceMs: 5 });
    expect(closing).toMatchObject({ status: "failed", result: { outcome: "timeout" }, current_step: null });
    expect(closing?.steps, "bitmeyen adım 'sürüyor' kalmaz").toEqual([{ id: "label", status: "failed", code: "timeout" }]);
    expect(result).toEqual({ status: "failed", lost: false, abandoned: true });
  });
});

describe("müşteri kopyası: ads_sync", () => {
  it("PANEL_EDITION=kopya iken ads_sync hiç koşmaz (bağlam açılmaz, iş failed)", async () => {
    vi.stubEnv("PANEL_EDITION", "kopya");
    try {
      const { deps, closing } = await run(claimedJob({ kind: "ads_sync" }));
      expect(deps.createContext).not.toHaveBeenCalled();
      expect(closing?.status).toBe("failed");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
