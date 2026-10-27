/**
 * Haftalık turda kredi (SAHTE tur adımları + sahte defter): krediye bağlı olmayan tur kancasız ve panel tavanıyla koşar; bağlı turda adımlar
 * kalan krediye göre başlar / başlamaz, inceleme sığan video sayısıyla sınırlanır, tamamlanan birimler (hesap, video, plan, notlar) düşülür.
 */
import { describe, expect, it } from "vitest";

import type { PanelJob } from "@/lib/domain/panel-job";
import { runJob } from "@/lib/job-runner/run-job";
import { analyzeSummary, approval, claimedJob, collectSummary, creditApproval, fakeCredits, fakeDeps, fakeRoutine, fakeStore, NOW, planResult, WORKER_ID, type FakeRoutine } from "@/lib/job-runner/test-support";
import type { StepRunner } from "@/lib/orchestrator/routine";
import { ok } from "@/lib/orchestrator/test-support";
import type { RoutineStepId } from "@/lib/orchestrator/types";

const JOB_ID = claimedJob().id;

/**
 * Turun kredi harcayan adımları, GERÇEK adımların yaptığı gibi özetlerini kancalara bildirir (`onCollected` / `onAnalyzed` / `onPlanned`);
 * inceleme, kendisine verilen video tavanı kadar video "inceler".
 */
function creditedRunners(routine: () => FakeRoutine, seen: { analyzeLimit?: number } = {}): Partial<Record<RoutineStepId, StepRunner>> {
  const wiring = () => routine().wirings[0];
  return {
    collect: async () => {
      wiring().onCollected?.(collectSummary({ maxUsd: 0.3 }));
      return ok();
    },
    analyze: async () => {
      const limit = wiring().analyzeLimit?.() ?? 19;
      seen.analyzeLimit = limit;
      const done = Math.min(limit, 3);
      wiring().onAnalyzed?.(analyzeSummary({ selected: done, ok: done, skippedByCap: limit < 3 ? 3 - limit : 0 }));
      return ok();
    },
    plan: async () => {
      wiring().onPlanned?.(planResult());
      return ok();
    },
  };
}

async function run(job: Partial<PanelJob>, reserved: number | undefined, seen: { analyzeLimit?: number } = {}) {
  const fake = fakeStore();
  const routine: FakeRoutine = fakeRoutine({}, creditedRunners(() => routine, seen));
  const deps = fakeDeps({ routineDeps: routine.factory });
  const credits = fakeCredits({ enforced: reserved !== undefined, open: reserved === undefined ? {} : { [JOB_ID]: reserved } });
  const log: string[] = [];
  const result = await runJob(claimedJob({ kind: "routine", ...job }), { store: fake.store, deps, credits: credits.port, workerId: WORKER_ID, clock: () => NOW, clockMs: () => 0, echo: (line) => log.push(line), heartbeatMs: 60_000 });
  const steps = (fake.patches.findLast((patch) => Array.isArray(patch.steps))?.steps ?? []) as { id: string; status: string; code?: string }[];
  return { fake, routine, deps, credits, result, log, closing: fake.closing(), steps, step: (id: string) => steps.find((entry) => entry.id === id) };
}

describe("haftalık tur: kredi", () => {
  it("krediye bağlı OLMAYAN tur: kredi kancası verilmez, inceleme panel tavanıyla koşar, defter çağrılmaz, hesap sayısı okunmaz", async () => {
    const seen: { analyzeLimit?: number } = {};
    const { routine, deps, credits, closing } = await run({}, undefined, seen);
    expect([routine.wirings[0].analyzeLimit, routine.wirings[0].onCollected, routine.wirings[0].onPlanned]).toEqual([undefined, undefined, undefined]);
    expect(seen.analyzeLimit).toBe(19);
    expect(deps.collectTargetCount).not.toHaveBeenCalled();
    expect(closing).toMatchObject({ status: "succeeded" });
    expect((closing?.result as { credits?: unknown }).credits).toBeUndefined();
    expect([credits.lookups, credits.settled, credits.released]).toEqual([[], [], []]);
  });

  it("yalnız kredi onaylı tur: toplama onay bekler (eskimiş onay sayılmaz); inceleme + plan + notlar düşülür", async () => {
    const { routine, closing, credits, step, log } = await run({ approval: creditApproval(254) }, 254);
    expect(routine.steps.collect, "kredi onayı Apify'a para harcatmaz").not.toHaveBeenCalled();
    expect(step("collect")).toMatchObject({ status: "needs_approval" });
    expect(step("collect")?.code, "USD onayı hiç verilmedi: eskimiş değil").toBeUndefined();
    expect(log.some((line) => line.includes("24 saatten eski"))).toBe(false);
    expect(closing).toMatchObject({ status: "succeeded", result: { credits: { reserved: 254, due: 94, charged: 94, units: { video_review: 3, weekly_plan: 1, briefing: 1 } } } });
    expect(credits.hold()).toMatchObject({ status: "settled", charged: 94 });
  });

  it("USD onayı + kredi: toplama koşar, taranan hesap da düşülür", async () => {
    const { routine, deps, closing } = await run({ approval: { ...approval(0.3), maxCredits: 454 } }, 454);
    expect(routine.steps.collect).toHaveBeenCalledTimes(1);
    expect(deps.collectTargetCount).toHaveBeenCalledTimes(1);
    expect(closing?.result).toMatchObject({ credits: { due: 8 + 94, charged: 102, units: { account_scan: 1, video_review: 3, weekly_plan: 1, briefing: 1 } } });
  });

  it("ayrılan kredi plana yetmezse plan adımı BAŞLAMAZ (credits_exhausted), sonraki adım yine koşar; tur partial, yapılan düşer", async () => {
    const seen: { analyzeLimit?: number } = {};
    const { routine, closing, step } = await run({ approval: creditApproval(50) }, 50, seen);
    expect(seen.analyzeLimit, "50 krediye 5 video sığar").toBe(5);
    expect(routine.steps.plan).not.toHaveBeenCalled();
    expect(step("plan")).toMatchObject({ status: "skipped", code: "credits_exhausted" });
    expect(routine.steps.briefing, "notlar kalan krediye sığar").toHaveBeenCalledTimes(1);
    expect(closing).toMatchObject({ status: "partial", result: { outcome: "credits_exhausted", credits: { reserved: 50, due: 34, charged: 34, units: { video_review: 3, briefing: 1 } } } });
  });

  it("inceleme kalan krediye sığan video sayısıyla sınırlanır; sığmayan video kaldıysa tur partial", async () => {
    const seen: { analyzeLimit?: number } = {};
    const { closing, routine } = await run({ approval: creditApproval(24) }, 24, seen);
    expect(seen.analyzeLimit).toBe(2);
    expect(routine.steps.plan).not.toHaveBeenCalled();
    expect(closing).toMatchObject({ status: "partial", result: { outcome: "credits_exhausted", credits: { due: 24, charged: 24, units: { video_review: 2, briefing: 1 } } } });
  });

  it("toplama ayrılan krediye sığmıyorsa hiç başlamaz (Apify'a gidilmez); diğer adımlar kalan krediyle koşar", async () => {
    // 4 hesap × 8 = 32 kredi gerekir; 30 ayrılmış.
    const { routine, step, closing } = await run({ approval: { ...approval(0.3), maxCredits: 30 } }, 30);
    expect(routine.steps.collect).not.toHaveBeenCalled();
    expect(step("collect")).toMatchObject({ status: "skipped", code: "credits_exhausted" });
    expect(closing).toMatchObject({ status: "partial", result: { outcome: "credits_exhausted", credits: { reserved: 30, due: 30, charged: 30, units: { video_review: 3 } } } });
  });

  it("önizleme (kuru koşu) krediye dokunmaz: defter çağrılmaz, adım koşmaz", async () => {
    const { routine, credits, closing } = await run({ dryRun: true }, undefined);
    expect(routine.precheck).not.toHaveBeenCalled();
    expect(closing).toMatchObject({ status: "succeeded" });
    expect([credits.lookups, credits.settled, credits.released]).toEqual([[], [], []]);
  });
});
