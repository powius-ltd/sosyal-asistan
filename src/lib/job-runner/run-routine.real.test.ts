/**
 * Haftalık tur işi · GERÇEK bağlama (`createRoutineDeps`) ile: satırdaki onaydan `collectOnce`'a kadar olan zincir uçtan uca sınanır.
 * Para / kota harcayan modüller taklittir (`collectOnce`, `runLabeling`, `runPlan`, alt süreç…): hiçbir gerçek çağrı yapılmaz.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PanelJob } from "@/lib/domain/panel-job";
import { runJob } from "@/lib/job-runner/run-job";
import { analyzeSummary, approval, claimedJob, collectSummary, fakeDeps, fakeStore, labelSummary, NOW, planResult, WORKER_ID, WS_ID, type FakeStore } from "@/lib/job-runner/test-support";
import { createRoutineDeps } from "@/lib/orchestrator/steps";
import { baseState } from "@/lib/orchestrator/test-support";

const mocks = vi.hoisted(() => ({
  collectOnce: vi.fn(),
  runAnalysis: vi.fn(),
  runLabeling: vi.fn(),
  runPlan: vi.fn(),
  runHousekeeping: vi.fn(),
  checkMeasurementDue: vi.fn(),
  writeRoutineReport: vi.fn(),
  loadRoutineState: vi.fn(),
  runSubprocess: vi.fn(),
}));

vi.mock("@/lib/collection/collect-once", () => ({ collectOnce: mocks.collectOnce }));
vi.mock("@/lib/intel/analyze-run", () => ({ runAnalysis: mocks.runAnalysis }));
vi.mock("@/lib/intel/label-run", () => ({ runLabeling: mocks.runLabeling }));
vi.mock("@/lib/intel/plan-run", () => ({ runPlan: mocks.runPlan }));
vi.mock("@/lib/intel/housekeeping", () => ({ runHousekeeping: mocks.runHousekeeping }));
vi.mock("@/lib/outcomes/notify", () => ({ checkMeasurementDue: mocks.checkMeasurementDue }));
vi.mock("@/lib/orchestrator/report-write", () => ({ writeRoutineReport: mocks.writeRoutineReport }));
vi.mock("@/lib/orchestrator/state", () => ({ loadRoutineState: mocks.loadRoutineState }));
vi.mock("@/lib/llm/subprocess", () => ({ runSubprocess: mocks.runSubprocess }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.collectOnce.mockImplementation(async (options: { maxUsd?: number }) => collectSummary(options));
  mocks.runAnalysis.mockResolvedValue(analyzeSummary());
  mocks.runLabeling.mockResolvedValue(labelSummary());
  mocks.runPlan.mockResolvedValue(planResult());
  mocks.checkMeasurementDue.mockResolvedValue({ due: [], created: 0 });
  mocks.writeRoutineReport.mockResolvedValue([]);
  mocks.runHousekeeping.mockResolvedValue(undefined);
  mocks.runSubprocess.mockResolvedValue({ exitCode: 0 });
  // Gerçek `loadRoutineState` gibi: onaylı tavan duruma girer, `planRoutine` kararı ona göre verir.
  mocks.loadRoutineState.mockImplementation(async (_ctx: unknown, options: { apifyMaxUsd?: number }) =>
    baseState({ now: NOW.toISOString(), ...(options.apifyMaxUsd === undefined ? {} : { apifyMaxUsd: options.apifyMaxUsd }) }),
  );
});

async function run(job: Partial<PanelJob>, arrange?: (fake: FakeStore) => void) {
  const fake = fakeStore();
  arrange?.(fake);
  const deps = fakeDeps({ routineDeps: createRoutineDeps });
  await runJob(claimedJob({ kind: "routine", ...job }), { store: fake.store, deps, workerId: WORKER_ID, clock: () => NOW, clockMs: () => 0, heartbeatMs: 60_000 });
  return { fake, deps, closing: fake.closing() };
}

describe("haftalık tur işi → collectOnce (gerçek bağlama)", () => {
  it("onaysız satırda collectOnce HİÇ çağrılmaz; diğer adımlar $0 koşar", async () => {
    const { fake, closing } = await run({});
    expect(mocks.collectOnce).not.toHaveBeenCalled();
    expect(mocks.loadRoutineState.mock.calls[0][1].apifyMaxUsd).toBeUndefined();
    expect(fake.stepStatuses()).toMatchObject({ collect: "needs_approval", label: "ok", plan: "ok", measure_check: "ok" });
    expect(mocks.runLabeling).toHaveBeenCalledTimes(1);
    expect(closing?.status).toBe("succeeded");
  });

  it("onaylı satırda collectOnce TEK kez ve maxUsd = satırdaki tutarla çağrılır", async () => {
    const { fake } = await run({ approval: approval(0.17) });
    expect(mocks.collectOnce).toHaveBeenCalledTimes(1);
    expect(mocks.collectOnce.mock.calls[0][0]).toMatchObject({ workspaceId: WS_ID, maxUsd: 0.17, now: NOW });
    expect(mocks.collectOnce.mock.calls[0][0].dryRun).toBeUndefined();
    expect(fake.stepStatuses().collect).toBe("ok");
  });

  it("24 saatten eski onay harcatmaz: collectOnce çağrılmaz", async () => {
    const { fake, closing } = await run({ approval: approval(0.17, 24 * 60 + 1) });
    expect(mocks.collectOnce).not.toHaveBeenCalled();
    expect(fake.stepStatuses().collect).toBe("needs_approval");
    expect(closing?.status).toBe("succeeded");
  });

  it("tahmin onaylı tutarı aşarsa toplama başlamaz (adım onay bekliyor), tur sürer", async () => {
    const { fake, closing } = await run({ approval: approval(0.05) });
    expect(mocks.collectOnce.mock.calls[0][0].maxUsd).toBe(0.05);
    expect(fake.stepStatuses()).toMatchObject({ collect: "needs_approval", plan: "ok" });
    expect(closing?.status).toBe("succeeded");
  });

  it("önizleme: durum okunur, başka HİÇBİR şey çağrılmaz (toplama, etiket, plan, bakım, rapor / bildirim, alt süreç)", async () => {
    const { deps, closing } = await run({ dryRun: true });
    expect(mocks.loadRoutineState).toHaveBeenCalledTimes(1);
    for (const [name, mock] of Object.entries(mocks)) if (name !== "loadRoutineState") expect(mock, name).not.toHaveBeenCalled();
    for (const name of ["housekeeping", "collect", "measure", "analyze", "label", "plan", "briefing", "cluster", "writePlanMarkdown"] as const) expect(deps[name], name).not.toHaveBeenCalled();
    expect(closing).toMatchObject({ status: "succeeded", result: { exitCode: 0 } });
  });
});

type AnalyzeHooks = { onProgress?: (progress: { done: number; total: number }) => Promise<void>; shouldStop?: () => boolean };

describe("haftalık tur işi → runAnalysis (gerçek bağlama)", () => {
  it("turun inceleme adımı işçi kancalarıyla koşar: sayaç satıra yazılır, durma videolar arasında sorulur", async () => {
    mocks.runAnalysis.mockImplementation(async (_ctx: unknown, args: AnalyzeHooks) => {
      expect(args.shouldStop?.()).toBe(false);
      await args.onProgress?.({ done: 1, total: 4 });
      return analyzeSummary({ selected: 4, ok: 4 });
    });
    const { fake, deps, closing } = await run({});
    expect(mocks.runAnalysis).toHaveBeenCalledTimes(1);
    expect(mocks.runAnalysis.mock.calls[0][1]).toMatchObject({ pilot: false, dryRun: false });
    expect(deps.analyze, "işçi inceleme adımını yeniden kurmaz").not.toHaveBeenCalled();
    expect(fake.patches.map((patch) => patch.progress), "sayaç satıra yazıldı").toContainEqual({ done: 1, total: 4 });
    expect(fake.stepStatuses().analyze).toBe("ok");
    expect(closing?.status).toBe("succeeded");
  });

  it("inceleme sırasında durdurma: başlatılmayan video kaldıysa iş kesildi sayılır; sonraki adımlar başlamaz, rapor yazılmaz", async () => {
    let store: FakeStore | undefined;
    mocks.runAnalysis.mockImplementation(async (_ctx: unknown, args: AnalyzeHooks) => {
      store?.requestCancel(); // yönetici işi durdurdu
      await args.onProgress?.({ done: 1, total: 4 }); // sıradaki yazım isteği görür
      expect(args.shouldStop?.()).toBe(true);
      return analyzeSummary({ selected: 4, ok: 1, skippedByCap: 3 });
    });
    const { fake, closing } = await run({}, (s) => void (store = s));
    expect(mocks.runLabeling).not.toHaveBeenCalled();
    expect(mocks.runPlan).not.toHaveBeenCalled();
    expect(mocks.writeRoutineReport).not.toHaveBeenCalled();
    expect(fake.stepStatuses()).toMatchObject({ analyze: "ok", label: "pending", plan: "pending" });
    expect(closing?.status).toBe("cancelled");
  });
});
