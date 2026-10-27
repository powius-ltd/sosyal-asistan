import { describe, expect, it, vi } from "vitest";

import { LlmError } from "@/lib/llm/types";
import { runRoutine, type RoutineDeps, type StepRunner } from "@/lib/orchestrator/routine";
import { baseState, NOW, ok } from "@/lib/orchestrator/test-support";
import { ROUTINE_STEPS, type RoutineState, type RoutineStepId, type StepOutput } from "@/lib/orchestrator/types";

type Runners = Partial<Record<RoutineStepId, StepRunner>>;

function makeDeps(state: RoutineState, runners: Runners = {}, overrides: Partial<RoutineDeps> = {}) {
  const spies = Object.fromEntries(ROUTINE_STEPS.map((step) => [step, vi.fn(runners[step] ?? (async () => ok()))])) as Record<RoutineStepId, ReturnType<typeof vi.fn>>;
  const deps: RoutineDeps = {
    now: new Date(NOW),
    dryRun: false,
    log: () => undefined,
    clock: () => 0,
    loadState: vi.fn(async () => state),
    precheck: vi.fn(async () => ok("önkontrol tamam")),
    steps: spies as unknown as Record<RoutineStepId, StepRunner>,
    writeReport: vi.fn(async () => []),
    ...overrides,
  };
  return { deps, spies };
}

const statusOf = (report: Awaited<ReturnType<typeof runRoutine>>, step: string) => report.steps.find((s) => s.step === step)?.status;

describe("runRoutine: onay kapısı", () => {
  it("Apify onayı yoksa toplama adımı HİÇ çağrılmaz; adım needs_approval, çıkış 0", async () => {
    const { deps, spies } = makeDeps(baseState());
    const report = await runRoutine(deps);
    expect(spies.collect).not.toHaveBeenCalled();
    expect(statusOf(report, "collect")).toBe("needs_approval");
    expect(report.steps.find((s) => s.step === "collect")?.spend?.estimateUsd).toBe(0.27);
    expect(report.exitCode).toBe(0);
  });

  it("onay varsa toplama koşar ve diğer adımlar sırayla ilerler", async () => {
    const order: string[] = [];
    const record = (step: string): StepRunner => async () => {
      order.push(step);
      return ok();
    };
    const runners = Object.fromEntries(ROUTINE_STEPS.map((s) => [s, record(s)])) as Runners;
    const { deps } = makeDeps(baseState({ apifyMaxUsd: 0.3 }), runners);
    const report = await runRoutine(deps);
    expect(order).toEqual(["collect", "analyze", "label", "plan", "measure_check", "briefing"]);
    expect(report.exitCode).toBe(0);
  });
});

describe("runRoutine: hata yönetimi", () => {
  it("bir adım düşerse bağımsız adımlar sürer; çıkış 4", async () => {
    const { deps, spies } = makeDeps(baseState(), {
      analyze: async () => {
        throw new Error("agy çöktü");
      },
    });
    const report = await runRoutine(deps);
    expect(statusOf(report, "analyze")).toBe("failed");
    expect(report.steps.find((s) => s.step === "analyze")?.reason).toContain("agy çöktü");
    for (const step of ["label", "plan", "measure_check", "briefing"] as const) expect(spies[step]).toHaveBeenCalledTimes(1);
    expect(report.exitCode).toBe(4);
  });

  it("failed dönen adım (fırlatmadan) de çıkışı 4 yapar; needs_approval/skipped yapmaz", async () => {
    const failed: StepOutput = { status: "failed", reason: "kota" };
    const { deps } = makeDeps(baseState(), { analyze: async () => failed });
    expect((await runRoutine(deps)).exitCode).toBe(4);
    const { deps: calm } = makeDeps(baseState(), { analyze: async () => ({ status: "needs_approval", reason: "yeniden toplama" }), plan: async () => ({ status: "skipped", reason: "ses yetersiz" }) });
    expect((await runRoutine(calm)).exitCode).toBe(0);
  });

  it("kalıcı CLI hatası (adım çıktısı): kalan LLM adımları (plan, brifing) denenmez; LLM'siz adım sürer", async () => {
    const { deps, spies } = makeDeps(baseState(), { label: async () => ({ status: "failed", reason: "CLI yok", llmUnavailable: true }) });
    const report = await runRoutine(deps);
    expect(spies.plan).not.toHaveBeenCalled();
    expect(spies.briefing).not.toHaveBeenCalled();
    expect(statusOf(report, "plan")).toBe("skipped");
    expect(statusOf(report, "briefing")).toBe("skipped");
    expect(spies.measure_check).toHaveBeenCalledTimes(1);
    expect(spies.analyze).toHaveBeenCalledTimes(1); // etiketten önce
    expect(report.exitCode).toBe(4);
  });

  it("kalıcı CLI hatası (fırlayan LlmError spawn_failed) aynı sonucu verir", async () => {
    const { deps, spies } = makeDeps(baseState(), {
      label: async () => {
        throw new LlmError("spawn_failed", "claude bulunamadı");
      },
    });
    const report = await runRoutine(deps);
    expect(spies.plan).not.toHaveBeenCalled();
    expect(spies.briefing).not.toHaveBeenCalled();
    expect(report.exitCode).toBe(4);
  });

  it("kalıcı olmayan LlmError (invalid_output) sonraki LLM adımlarını durdurmaz", async () => {
    const { deps, spies } = makeDeps(baseState(), {
      label: async () => {
        throw new LlmError("invalid_output", "şema");
      },
    });
    await runRoutine(deps);
    expect(spies.plan).toHaveBeenCalledTimes(1);
    expect(spies.briefing).toHaveBeenCalledTimes(1);
  });

  it("plan adımının notu brifinge girer (hata değil)", async () => {
    const { deps, spies } = makeDeps(baseState(), { plan: async () => ({ status: "skipped", reason: "mevcut plan korundu", planNote: "fikir yetersiz" }) });
    const report = await runRoutine(deps);
    expect(spies.briefing).toHaveBeenCalledWith(expect.objectContaining({ planNote: "fikir yetersiz" }));
    expect(report.exitCode).toBe(0);
  });
});

describe("runRoutine: önkontrol ve durum", () => {
  it("önkontrol düşerse hiçbir adım koşmaz; çıkış 1; rapor yine yazılır", async () => {
    const { deps, spies } = makeDeps(baseState(), {}, { precheck: vi.fn(async () => ({ status: "failed" as const, reason: "Claude CLI yok" })) });
    const report = await runRoutine(deps);
    for (const step of ROUTINE_STEPS) expect(spies[step]).not.toHaveBeenCalled();
    expect(report.exitCode).toBe(1);
    expect(deps.writeReport).toHaveBeenCalledTimes(1);
  });

  it("durum okunamazsa (DB) çıkış 1, adım ve rapor yok", async () => {
    const { deps, spies } = makeDeps(baseState(), {}, {
      loadState: vi.fn(async () => {
        throw new Error("bağlantı reddedildi");
      }),
    });
    const report = await runRoutine(deps);
    expect(report.exitCode).toBe(1);
    expect(report.steps[0]?.reason).toContain("bağlantı reddedildi");
    expect(deps.precheck).not.toHaveBeenCalled();
    expect(deps.writeReport).not.toHaveBeenCalled();
    for (const step of ROUTINE_STEPS) expect(spies[step]).not.toHaveBeenCalled();
  });

  it("rapor yazımı düşerse rutin sonucu değişmez", async () => {
    const lines: string[] = [];
    const { deps } = makeDeps(baseState(), {}, {
      log: (l) => lines.push(l),
      writeReport: vi.fn(async () => {
        throw new Error("disk dolu");
      }),
    });
    const report = await runRoutine(deps);
    expect(report.exitCode).toBe(0);
    expect(lines.some((l) => l.includes("rapor yazılamadı"))).toBe(true);
  });
});

describe("runRoutine: dry-run", () => {
  it("yalnız durumu okur ve karar verir: önkontrol, adım, rapor/bildirim yazımı HİÇ çağrılmaz", async () => {
    const { deps, spies } = makeDeps(baseState({ apifyMaxUsd: 0.3 }), {}, { dryRun: true });
    const report = await runRoutine(deps);
    expect(deps.loadState).toHaveBeenCalledTimes(1);
    expect(deps.precheck).not.toHaveBeenCalled();
    expect(deps.writeReport).not.toHaveBeenCalled();
    for (const step of ROUTINE_STEPS) expect(spies[step]).not.toHaveBeenCalled();
    expect(report.dryRun).toBe(true);
    expect(report.steps).toEqual([]);
    expect(report.plan).toHaveLength(ROUTINE_STEPS.length);
    expect(report.exitCode).toBe(0);
  });
});
