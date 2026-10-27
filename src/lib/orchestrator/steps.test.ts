/**
 * Gerçek bağlama (`createRoutineDeps`) testi: `runX` işlevleri casus; Apify onayı olmadan `collectOnce` ÇAĞRILMAZ.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { IntelContext } from "@/lib/intel/context";
import { runRoutine } from "@/lib/orchestrator/routine";
import { createRoutineDeps, type BriefingRunner } from "@/lib/orchestrator/steps";
import { baseState, NOW } from "@/lib/orchestrator/test-support";
import type { RoutineState } from "@/lib/orchestrator/types";

const mocks = vi.hoisted(() => ({
  collectOnce: vi.fn(),
  runAnalysis: vi.fn(),
  runLabeling: vi.fn(),
  runPlan: vi.fn(),
  runHousekeeping: vi.fn(),
  checkMeasurementDue: vi.fn(),
  writeRoutineReport: vi.fn(),
}));

vi.mock("@/lib/collection/collect-once", () => ({ collectOnce: mocks.collectOnce }));
vi.mock("@/lib/intel/analyze-run", () => ({ runAnalysis: mocks.runAnalysis }));
vi.mock("@/lib/intel/label-run", () => ({ runLabeling: mocks.runLabeling }));
vi.mock("@/lib/intel/plan-run", () => ({ runPlan: mocks.runPlan }));
vi.mock("@/lib/intel/housekeeping", () => ({ runHousekeeping: mocks.runHousekeeping }));
vi.mock("@/lib/outcomes/notify", () => ({ checkMeasurementDue: mocks.checkMeasurementDue }));
vi.mock("@/lib/orchestrator/report-write", () => ({ writeRoutineReport: mocks.writeRoutineReport }));
vi.mock("@/lib/orchestrator/state", () => ({ loadRoutineState: vi.fn() }));

const ctx = { workspaceId: "ws-1", now: new Date(NOW), client: {}, repo: {}, workspace: {} } as unknown as IntelContext;
const ARGS = { dryRun: false, concurrency: 3 };

const summaries = {
  analysis: { outcome: "completed", selected: 2, ok: 2, insufficient: 0, failed: 0, skippedByCap: 0, expired: 0, missing: 0, agyCalls: 2, screening: {}, seconds: 1 },
  label: { outcome: "completed", counts: {}, selected: 3, labeled: 3, verified: 3, unverified: 0, unsure: 0, unlabelable: 0, failed: 0, batches: 1, seconds: 1 },
  plan: { outcome: "saved", weekStart: "2026-10-05", status: "ready", confidence: "medium", ideas: 6, planned: 4, notes: [], markdown: "# plan", seconds: 1 },
  collect: { outcome: "completed", plan: { estimatedUsd: 0.25, maxUsd: 0.3 }, targets: [], runs: [], cost: { reservedUsd: 0.25, actualUsd: 0.24, pendingReconcile: 0 }, notes: [] },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.collectOnce.mockResolvedValue(summaries.collect);
  mocks.runAnalysis.mockResolvedValue(summaries.analysis);
  mocks.runLabeling.mockResolvedValue(summaries.label);
  mocks.runPlan.mockResolvedValue(summaries.plan);
  mocks.checkMeasurementDue.mockResolvedValue({ due: [], created: 0 });
  mocks.writeRoutineReport.mockResolvedValue([]);
  mocks.runHousekeeping.mockResolvedValue(undefined);
});

function build(state: RoutineState, wiring: { apifyMaxUsd?: number; runBriefing?: BriefingRunner } = {}) {
  const args = { ...ARGS, ...(wiring.apifyMaxUsd === undefined ? {} : { apifyMaxUsd: wiring.apifyMaxUsd }) };
  const deps = createRoutineDeps(ctx, { args, log: () => undefined, runBriefing: wiring.runBriefing, checkClaude: async () => ({ available: true }) });
  return { ...deps, clock: () => 0, loadState: async () => state };
}

describe("createRoutineDeps: Apify onay kapısı", () => {
  it("--apify-max yoksa runRoutine collectOnce'ı HİÇ çağırmaz; diğer adımlar koşar", async () => {
    const report = await runRoutine(build(baseState()));
    expect(mocks.collectOnce).not.toHaveBeenCalled();
    expect(report.steps.find((s) => s.step === "collect")?.status).toBe("needs_approval");
    expect(mocks.runAnalysis).toHaveBeenCalledTimes(1);
    expect(mocks.runLabeling).toHaveBeenCalledTimes(1);
    expect(mocks.runPlan).toHaveBeenCalledWith(ctx, { week: "2026-10-05", dryRun: false }, expect.any(Function));
    expect(report.exitCode).toBe(0);
  });

  it("çifte emniyet: onaysız çağrılsa bile adım runner'ı collectOnce'a gitmez", async () => {
    const deps = build(baseState());
    await expect(deps.steps.collect({ state: baseState() })).rejects.toThrow(/onayı yok/);
    expect(mocks.collectOnce).not.toHaveBeenCalled();
  });

  it("--apify-max verilince collectOnce tavanla çağrılır ve tahmin/gerçek rapora girer", async () => {
    const report = await runRoutine(build(baseState({ apifyMaxUsd: 0.3 }), { apifyMaxUsd: 0.3 }));
    expect(mocks.collectOnce).toHaveBeenCalledTimes(1);
    expect(mocks.collectOnce).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: "ws-1", maxUsd: 0.3 }));
    expect(report.steps.find((s) => s.step === "collect")?.spend).toEqual({ estimateUsd: 0.25, actualUsd: 0.24 });
  });

  it("tavan tahmini aşarsa (blocked) adım needs_approval: hata değil", async () => {
    mocks.collectOnce.mockResolvedValue({ ...summaries.collect, outcome: "blocked", plan: { estimatedUsd: 0.4, maxUsd: 0.3 } });
    const report = await runRoutine(build(baseState({ apifyMaxUsd: 0.3 }), { apifyMaxUsd: 0.3 }));
    expect(report.steps.find((s) => s.step === "collect")?.status).toBe("needs_approval");
    expect(report.exitCode).toBe(0);
  });
});

describe("createRoutineDeps: LLM adımları ve brifing", () => {
  it("etiketleme günlüğünde kalıcı CLI hatası görülürse plan ve brifing atlanır", async () => {
    const briefing = vi.fn(async () => ({ ok: true }));
    mocks.runLabeling.mockImplementation(async (_ctx: unknown, _args: unknown, log: (line: string) => void) => {
      log("[1/1] parti başarısız (spawn_failed): claude bulunamadı — kalan 3 içerik denenmedi");
      return { ...summaries.label, labeled: 0, verified: 0, failed: 3, batches: 0 };
    });
    const report = await runRoutine(build(baseState(), { runBriefing: briefing }));
    expect(mocks.runPlan).not.toHaveBeenCalled();
    expect(briefing).not.toHaveBeenCalled();
    expect(report.steps.find((s) => s.step === "label")?.status).toBe("failed");
    expect(report.steps.find((s) => s.step === "plan")?.status).toBe("skipped");
    expect(report.exitCode).toBe(4);
  });

  it("brifing bağlı değilse skipped; bağlıysa plan notuyla çağrılır", async () => {
    const unwired = await runRoutine(build(baseState()));
    expect(unwired.steps.find((s) => s.step === "briefing")).toMatchObject({ status: "skipped" });
    expect(unwired.exitCode).toBe(0);

    const briefing = vi.fn(async () => ({ ok: true, note: "1 madde" }));
    const wired = await runRoutine(build(baseState(), { runBriefing: briefing }));
    expect(briefing).toHaveBeenCalledTimes(1);
    expect(briefing).toHaveBeenCalledWith(expect.objectContaining({ intel: ctx, planNote: expect.stringContaining("Plan kaydedildi") }));
    expect(wired.steps.find((s) => s.step === "briefing")?.status).toBe("ok");
  });

  it("brifing ok:false → failed (çıkış 4); önceki brifing korunur (yazan biz değiliz)", async () => {
    const report = await runRoutine(build(baseState(), { runBriefing: async () => ({ ok: false, note: "doğrulama reddetti" }) }));
    expect(report.steps.find((s) => s.step === "briefing")).toMatchObject({ status: "failed", reason: "doğrulama reddetti" });
    expect(report.exitCode).toBe(4);
  });

  it("Claude CLI yoksa (önkontrol) hiçbir adım koşmaz: çıkış 1", async () => {
    const deps = createRoutineDeps(ctx, { args: ARGS, log: () => undefined, checkClaude: async () => ({ available: false, reason: "claude bulunamadı" }) });
    const report = await runRoutine({ ...deps, clock: () => 0, loadState: async () => baseState() });
    expect(report.exitCode).toBe(1);
    expect(mocks.runAnalysis).not.toHaveBeenCalled();
    expect(mocks.runHousekeeping).not.toHaveBeenCalled();
  });
});

describe("createRoutineDeps: dry-run", () => {
  it("hiçbir çağrı/yazma yok: casuslar sıfır", async () => {
    const deps = createRoutineDeps(ctx, { args: { ...ARGS, dryRun: true, apifyMaxUsd: 0.3 }, log: () => undefined, checkClaude: async () => ({ available: true }) });
    const report = await runRoutine({ ...deps, loadState: async () => baseState({ apifyMaxUsd: 0.3 }) });
    for (const spy of Object.values(mocks)) expect(spy).not.toHaveBeenCalled();
    expect(report.steps).toEqual([]);
    expect(report.exitCode).toBe(0);
  });
});
