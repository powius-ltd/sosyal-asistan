import { describe, expect, it } from "vitest";

import type { PanelJob } from "@/lib/domain/panel-job";
import type { JobRunnerDeps } from "@/lib/job-runner/deps";
import { runJob } from "@/lib/job-runner/run-job";
import { approval, claimedJob, fakeDeps, fakeRoutine, fakeStore, NOW, WORKER_ID, type FakeRoutine, type FakeStore } from "@/lib/job-runner/test-support";
import type { StepRunner } from "@/lib/orchestrator/routine";
import { ok } from "@/lib/orchestrator/test-support";
import { ROUTINE_STEPS, type RoutineState, type RoutineStepId } from "@/lib/orchestrator/types";

interface Setup {
  state?: Partial<RoutineState>;
  runners?: Partial<Record<RoutineStepId, StepRunner>>;
  deps?: Partial<JobRunnerDeps>;
  /** Depo ve tur kurulduktan sonra, iş koşmadan önce (iptal / çit kaybı tetikleyicisi bağlamak için). */
  arrange?: (fake: FakeStore, routine: FakeRoutine) => void;
}

async function run(job: Partial<PanelJob>, setup: Setup = {}) {
  const fake = fakeStore();
  const routine = fakeRoutine(setup.state, setup.runners);
  const deps = fakeDeps({ routineDeps: routine.factory, ...setup.deps });
  setup.arrange?.(fake, routine);
  const log: string[] = [];
  const result = await runJob(claimedJob({ kind: "routine", ...job }), { store: fake.store, deps, workerId: WORKER_ID, clock: () => NOW, clockMs: () => 0, echo: (line) => log.push(line), heartbeatMs: 60_000 });
  return { fake, routine, deps, result, log, closing: fake.closing() };
}

/** Adım `step` sürerken (satıra "sürüyor" yazılırken) tetiklenir. */
const whileRunning = (fake: FakeStore, step: string, trigger: () => void) =>
  fake.onPatch((patch) => {
    if (patch.current_step === step) trigger();
  });

describe("haftalık tur: harcama kapısı", () => {
  it("onaysız satır: tur tavansız bağlanır, toplama adımı HİÇ çağrılmaz (onay bekliyor), diğer adımlar koşar", async () => {
    const { routine, fake, closing } = await run({});
    expect(routine.wirings).toHaveLength(1);
    expect(routine.wirings[0].args.apifyMaxUsd).toBeUndefined();
    expect(routine.steps.collect).not.toHaveBeenCalled();
    expect(fake.stepStatuses().collect).toBe("needs_approval");
    expect(routine.steps.plan).toHaveBeenCalledTimes(1);
    expect(closing?.status).toBe("succeeded");
  });

  it("onaylı satır: tavan = satırdaki tutar; toplama adımı koşar", async () => {
    const { routine, fake } = await run({ approval: approval(0.3) });
    expect(routine.wirings[0].args).toMatchObject({ apifyMaxUsd: 0.3, dryRun: false });
    expect(routine.steps.collect).toHaveBeenCalledTimes(1);
    expect(fake.stepStatuses().collect).toBe("ok");
  });

  it("24 saatten eski onay harcatmaz: tavan verilmez, toplama çağrılmaz, adım approval_expired koduyla yazılır", async () => {
    const { routine, fake, closing } = await run({ approval: approval(0.3, 24 * 60 + 1) });
    expect(routine.wirings[0].args.apifyMaxUsd).toBeUndefined();
    expect(routine.steps.collect).not.toHaveBeenCalled();
    const steps = fake.patches.findLast((patch) => Array.isArray(patch.steps))?.steps as { id: string; status: string; code?: string }[];
    expect(steps.find((step) => step.id === "collect")).toMatchObject({ status: "needs_approval", code: "approval_expired" });
    expect(closing?.status, "diğer adımlar $0 koştu").toBe("succeeded");
  });
});

describe("haftalık tur: adım ilerlemesi", () => {
  it("karar adımları önceden yazılır; adımlar sırayla sürüyor → tamam olur; rapor yolu sonuca girer", async () => {
    const { fake, routine, closing } = await run({}, { state: { plan: { exists: true, status: "ready" } } });
    const timeline = fake.timeline();
    // İlk yazım: önkontrol sırada + plan kararları (toplama onay bekliyor, plan zaten var → atlandı, kümeleme tür gereği atlandı).
    expect(timeline[0]).toEqual(["precheck:pending", "collect:needs_approval", "analyze:pending", "label:pending", "cluster:skipped", "plan:skipped", "measure_check:pending", "briefing:pending"]);
    const order = timeline.flatMap((steps) => steps.filter((step) => step.endsWith(":running")));
    expect(order).toEqual(["precheck:running", "analyze:running", "label:running", "measure_check:running", "briefing:running"]);
    // Bir adım sürerken sonrakiler başlamamıştır.
    for (const steps of timeline) expect(steps.filter((step) => step.endsWith(":running")).length).toBeLessThanOrEqual(1);
    expect(fake.stepStatuses()).toEqual({ precheck: "ok", collect: "needs_approval", analyze: "ok", label: "ok", cluster: "skipped", plan: "skipped", measure_check: "ok", briefing: "ok" });
    expect(routine.writeReport).toHaveBeenCalledTimes(1);
    expect(closing).toMatchObject({ status: "succeeded", result: { exitCode: 0, reportPath: "docs/rutin/test/2026-10-05.md" }, current_step: null });
  });

  it("inceleme turun KENDİ adımıdır: işçi adımı yeniden kurmaz, yalnız kancaları (sayaç + videolar arası durma) ve özet gözlemcisini bağlar", async () => {
    const { deps, routine, fake } = await run({});
    expect(routine.steps.analyze).toHaveBeenCalledTimes(1);
    expect(deps.analyze, "tek adımlı inceleme işinin koşucusu turda kullanılmaz").not.toHaveBeenCalled();
    const { analyzeHooks, onAnalyzed } = routine.wirings[0];
    expect(await analyzeHooks?.shouldStop?.()).toBe(false);
    expect(typeof analyzeHooks?.onProgress).toBe("function");
    expect(typeof onAnalyzed).toBe("function");
    expect(fake.stepStatuses().analyze).toBe("ok");
  });

  it("düşen adım: iş partial + step_failed; yazı aracı kalıcı hatasından sonra denenmeyen adımlar llm_unavailable koduyla yazılır", async () => {
    const { fake, routine, closing } = await run({}, { runners: { label: async () => ({ status: "failed", reason: "Claude CLI yok", llmUnavailable: true }) } });
    expect(routine.steps.plan).not.toHaveBeenCalled();
    expect(routine.steps.briefing).not.toHaveBeenCalled();
    const steps = fake.patches.findLast((patch) => Array.isArray(patch.steps))?.steps as { id: string; status: string; code?: string }[];
    expect(steps.find((step) => step.id === "label")).toMatchObject({ status: "failed", code: "llm_unavailable" });
    expect(steps.find((step) => step.id === "plan")).toMatchObject({ status: "skipped", code: "llm_unavailable" });
    expect(steps.find((step) => step.id === "briefing")).toMatchObject({ status: "skipped", code: "llm_unavailable" });
    expect(steps.find((step) => step.id === "measure_check")?.status).toBe("ok");
    expect(closing).toMatchObject({ status: "partial", result: { outcome: "step_failed", exitCode: 4 } });
  });

  it("fırlayan adım hatası satıra failed yazılır, tur sürer", async () => {
    const { fake, routine, closing } = await run({}, { runners: { measure_check: async () => { throw new Error("okunamadı"); } } });
    expect(fake.stepStatuses().measure_check).toBe("failed");
    expect(routine.steps.briefing).toHaveBeenCalledTimes(1);
    expect(closing?.status).toBe("partial");
  });

  it("önkontrol düşerse hiçbir adım koşmaz: failed + precheck_failed; durum okunamazsa önkontrol satırı failed yazılır", async () => {
    const precheck = await run({}, { arrange: (_fake, routine) => routine.precheck.mockResolvedValueOnce({ status: "failed", reason: "Claude CLI kullanılamıyor" }) });
    for (const step of ROUTINE_STEPS) expect(precheck.routine.steps[step]).not.toHaveBeenCalled();
    expect(precheck.closing).toMatchObject({ status: "failed", result: { outcome: "precheck_failed", exitCode: 1 } });

    const state = await run({}, { arrange: (_fake, routine) => routine.loadState.mockRejectedValueOnce(new Error("bağlantı reddedildi")) });
    expect(state.fake.stepStatuses()).toEqual({ precheck: "failed" });
    expect(state.closing).toMatchObject({ status: "failed", result: { outcome: "precheck_failed" } });
    expect(state.closing?.error).toContain("bağlantı reddedildi");

    // Önizlemede de aynı: durum okunamadıysa "bitti" denmez.
    const preview = await run({ dryRun: true }, { arrange: (_fake, routine) => routine.loadState.mockRejectedValueOnce(new Error("bağlantı reddedildi")) });
    expect(preview.fake.stepStatuses()).toEqual({ precheck: "failed" });
    expect(preview.closing).toMatchObject({ status: "failed", result: { outcome: "precheck_failed" } });
  });

  it("not ve kümeleme çalıştırıcıları işçinin bağımlılıklarına bağlanır (başarısızlık fırlatılmaz, sonuca çevrilir)", async () => {
    const { routine, deps } = await run({}, { deps: { briefing: async () => ({ ok: false, code: "invalid_output", message: "şema", persistent: false, seconds: 1 }) } });
    const wiring = routine.wirings[0];
    const context = { intel: {} as never, state: {} as never, log: () => undefined };
    expect(await wiring.runBriefing?.(context)).toEqual({ ok: false, note: "invalid_output: şema" });
    expect(await wiring.clusterOnly?.(context)).toEqual({ ok: true, note: "2 küme, 8 içerik" });
    expect(deps.briefing).toHaveBeenCalledTimes(1);
    expect(deps.cluster).toHaveBeenCalledTimes(1);
  });
});

describe("haftalık tur: durma", () => {
  it("iptalden sonra yeni adım BAŞLAMAZ: kalan adımlar sırada kalır, rapor / bildirim yazılmaz, iş cancelled", async () => {
    // Durdurma isteği inceleme adımı ÇALIŞIRKEN gelir: o adım biter, sonrakiler başlamaz.
    let store: FakeStore | undefined;
    const analyze: StepRunner = async () => {
      store?.requestCancel();
      return ok();
    };
    const { fake, routine, closing, result } = await run({}, { arrange: (s) => void (store = s), runners: { analyze } });
    for (const step of ["label", "plan", "measure_check", "briefing"] as const) expect(routine.steps[step], step).not.toHaveBeenCalled();
    expect(fake.stepStatuses()).toMatchObject({ precheck: "ok", analyze: "ok", label: "pending", plan: "pending", measure_check: "pending", briefing: "pending" });
    expect(fake.timeline().flat().filter((step) => step.endsWith(":running")), "iptalden sonra hiçbir adım 'sürüyor' yazılmadı").toEqual(["precheck:running", "analyze:running"]);
    expect(routine.writeReport).not.toHaveBeenCalled();
    expect(closing).toMatchObject({ status: "cancelled", current_step: null });
    expect(result.status).toBe("cancelled");
  });

  it("durdurma isteği adımın 'sürüyor' yazımında görülürse adım yine başlamaz ve satırda sıraya döner", async () => {
    const { fake, routine, closing } = await run({}, { arrange: (store) => whileRunning(store, "analyze", () => store.requestCancel()) });
    expect(routine.steps.analyze).not.toHaveBeenCalled();
    expect(routine.steps.label).not.toHaveBeenCalled();
    expect(fake.stepStatuses()).toMatchObject({ precheck: "ok", analyze: "pending", label: "pending" });
    expect(closing?.status).toBe("cancelled");
  });

  it("son adım sırasında gelen iptal turu kesmez: iş tamamlanır, rapor yazılır", async () => {
    let store: FakeStore | undefined;
    const briefing: StepRunner = async () => {
      store?.requestCancel();
      return ok();
    };
    const { routine, closing } = await run({}, { arrange: (s) => void (store = s), runners: { briefing } });
    expect(routine.writeReport).toHaveBeenCalledTimes(1);
    expect(closing?.status).toBe("succeeded");
  });

  it("iş alınır alınmaz durdurulduysa önkontrol dahil hiçbir adım koşmaz", async () => {
    const { routine, closing } = await run({}, { arrange: (store) => store.requestCancel() });
    expect(routine.precheck).not.toHaveBeenCalled();
    for (const step of ROUTINE_STEPS) expect(routine.steps[step]).not.toHaveBeenCalled();
    expect(closing?.status).toBe("cancelled");
  });

  it("nabız / yazım 0 satır etkilerse (çit) kalan adımlar koşmaz, kapanış yazılmaz, sonuç lost", async () => {
    const { fake, routine, result } = await run({}, { arrange: (store) => whileRunning(store, "label", () => store.loseFence()) });
    expect(routine.steps.label, "çit kaybı yazımda anlaşıldı: adım başlamadı").not.toHaveBeenCalled();
    for (const step of ["plan", "measure_check", "briefing"] as const) expect(routine.steps[step], step).not.toHaveBeenCalled();
    expect(routine.writeReport).not.toHaveBeenCalled();
    expect(fake.closing()).toBeUndefined();
    expect(result).toEqual({ lost: true, abandoned: false });
  });
});

describe("haftalık tur: önizleme", () => {
  it("yalnız durum okunur ve karar yazılır: önkontrol, adım, rapor, bakım, yazı / video aracı HİÇ çağrılmaz", async () => {
    const { routine, deps, fake, closing } = await run({ dryRun: true });
    expect(routine.wirings[0].args).toMatchObject({ dryRun: true });
    expect(routine.wirings[0].args.apifyMaxUsd).toBeUndefined();
    expect(routine.loadState).toHaveBeenCalledTimes(1);
    expect(routine.precheck).not.toHaveBeenCalled();
    expect(routine.writeReport).not.toHaveBeenCalled();
    for (const step of ROUTINE_STEPS) expect(routine.steps[step], step).not.toHaveBeenCalled();
    for (const name of ["housekeeping", "collect", "measure", "analyze", "label", "plan", "briefing", "cluster", "writePlanMarkdown"] as const) expect(deps[name], name).not.toHaveBeenCalled();
    expect(fake.stepStatuses()).toEqual({ collect: "needs_approval", analyze: "pending", label: "pending", cluster: "skipped", plan: "pending", measure_check: "pending", briefing: "pending" });
    // Toplama için tahmin: son bakışın tutarı (referans); onay penceresinin ön değeri buradan.
    expect(closing).toMatchObject({ status: "succeeded", result: { exitCode: 0, estimate: { usd: 0.27 } } });
    // Kredi tahmininin birim sayıları: toplama onay beklediği için hesap sayısı okundu (yalnız okuma), inceleme tavanı sayıldı.
    expect(deps.collectTargetCount).toHaveBeenCalledTimes(1);
    expect(closing).toMatchObject({ result: { estimate: { units: { accounts: 4, videos: 19, measureRuns: 0 } } } });
  });

  it("bağlama gerçek koşu dese de önizleme satırı adım koşturmaz (kuru koşu bayrağı satırdan zorlanır)", async () => {
    const fake = fakeStore();
    const routine = fakeRoutine();
    const deps = fakeDeps({ routineDeps: (ctx, wiring) => ({ ...routine.factory(ctx, wiring), dryRun: false }) });
    await runJob(claimedJob({ kind: "routine", dryRun: true }), { store: fake.store, deps, workerId: WORKER_ID, clock: () => NOW, heartbeatMs: 60_000 });
    expect(routine.precheck).not.toHaveBeenCalled();
    expect(routine.writeReport).not.toHaveBeenCalled();
    for (const step of ROUTINE_STEPS) expect(routine.steps[step], step).not.toHaveBeenCalled();
    expect(fake.closing()?.status).toBe("succeeded");
  });

  it("önizleme onaylı satırla açılsa bile (olamaz: DB kısıtı) tavan verilmez", async () => {
    const { routine } = await run({ dryRun: true, approval: approval(0.3) });
    expect(routine.wirings[0].args.apifyMaxUsd).toBeUndefined();
    expect(routine.steps.collect).not.toHaveBeenCalled();
  });
});

describe("tur adımı çıktısı", () => {
  it("adım notu ve harcaması satıra taşınır", async () => {
    const { fake } = await run({ approval: approval(0.3) }, { runners: { collect: async () => ok("3 Apify koşusu", { notes: ["1 hesap gizli"], spend: { estimateUsd: 0.2, actualUsd: 0.18 } }) } });
    const steps = fake.patches.findLast((patch) => Array.isArray(patch.steps))?.steps as { id: string; note?: string; spend?: object }[];
    expect(steps.find((step) => step.id === "collect")).toMatchObject({ note: "3 Apify koşusu · 1 hesap gizli", spend: { estimateUsd: 0.2, actualUsd: 0.18 } });
    expect(fake.closing()?.result).toMatchObject({ spend: { actualUsd: 0.18 } });
  });
});
