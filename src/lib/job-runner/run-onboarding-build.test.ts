/**
 * Başlangıç işi · `build` ("ilk tur"), SAHTE adımlarla (gerçek `planRoutine` kararı + casus adımlar). Asıl kanıt: karar baştan bir kez
 * verilmez; her adımdan önce durum yeniden okunur (boş hesapta toplanan videolar AYNI işte incelenir). Ayrıca: her kapanış kodu, kısmi
 * sonuç, tek hedef hatası, yazı aracı hatası, iptal, süre tavanı, kredi açık / kapalı.
 */
import { describe, expect, it } from "vitest";

import type { CollectSummary } from "@/lib/collection/types";
import { ONBOARDING_ANALYZE_LIMIT, ONBOARDING_COLLECT_LIMIT } from "@/lib/domain/onboarding-job";
import { buildRunners, collected, runOnboarding } from "@/lib/job-runner/run-onboarding-test-support";
import { analyzeSummary, planResult, type FakeRoutine } from "@/lib/job-runner/test-support";
import type { StepRunner } from "@/lib/orchestrator/routine";
import { ok } from "@/lib/orchestrator/test-support";
import type { RoutineState, RoutineStepId } from "@/lib/orchestrator/types";

/** Taze hesabın dünyası: toplamadan ÖNCE incelenecek video yoktur; toplama bitince 25 video seçilebilir olur, inceleme bitince etiketlenecek video çıkar. */
function freshAccount() {
  const world = { collected: false, analyzed: false, planned: false, loads: 0 };
  const state = (): Partial<RoutineState> => {
    world.loads += 1;
    return {
      collection: { newContentSinceBriefing: world.collected ? 25 : 0 },
      analysis: { selectable: world.collected && !world.analyzed ? 25 : 0 },
      labeling: { eligible: world.analyzed ? 3 : 0 },
      plan: { exists: world.planned },
      briefing: {},
    };
  };
  const collect = async (): Promise<CollectSummary> => {
    world.collected = true;
    return collected(25, [25, 25, 25], 0.27);
  };
  const runners = (seen: { analyzeLimit?: number }) => (routine: () => FakeRoutine): Partial<Record<RoutineStepId, StepRunner>> => {
    const base = buildRunners(routine, seen);
    return {
      analyze: async (input) => {
        world.analyzed = true;
        return (base.analyze as StepRunner)(input);
      },
      plan: async (input) => {
        world.planned = true;
        return (base.plan as StepRunner)(input);
      },
    };
  };
  return { world, state, collect, runners };
}

/** Varsayılan adımlar + üzerine yazılanlar. */
const runnersWith = (overrides: (routine: () => FakeRoutine) => Partial<Record<RoutineStepId, StepRunner>>) => (routine: () => FakeRoutine) => ({ ...buildRunners(routine), ...overrides(routine) });
const planNotSaved = runnersWith((routine) => ({
  plan: async () => {
    routine().wirings[0].onPlanned?.(planResult({ outcome: "voice_unusable", ideas: 0, planned: 0 }));
    return { status: "skipped", reason: "Ses profili yetersiz: plan üretilmedi." };
  },
}));

describe("ilk tur: adım arası yeniden karar", () => {
  it("boş hesap: toplanan videolar AYNI işte incelenir (durum her adımdan önce yeniden okunur); plan hazır → tamam", async () => {
    const fresh = freshAccount();
    const seen: { analyzeLimit?: number } = {};
    const { deps, routine, closing, written, ran, statuses, fake } = await runOnboarding("build", { params: { phase: "build", rivalIds: ["r1", "r2", "r3"] } }, { state: fresh.state, deps: { collect: fresh.collect }, runners: fresh.runners(seen) });

    expect(deps.collect).toHaveBeenCalledTimes(1);
    expect(deps.collect.mock.calls[0][0]).toMatchObject({ limit: ONBOARDING_COLLECT_LIMIT, maxUsd: 0.4 });
    expect(deps.collect.mock.calls[0][0].ownOnly).toBeUndefined();
    expect(routine.wirings[0].args.apifyMaxUsd, "turun toplama adımına onay verilmez").toBeUndefined();
    expect(routine.steps.collect, "turun kendi toplama adımı kullanılmaz").not.toHaveBeenCalled();
    expect(routine.steps.measure_check).not.toHaveBeenCalled();
    expect(routine.steps.analyze).toHaveBeenCalledTimes(1);
    expect(seen.analyzeLimit).toBe(ONBOARDING_ANALYZE_LIMIT);
    expect(fresh.world.loads, "toplamadan sonraki her adım için durum yeniden okundu").toBe(5);
    expect(ran()).toEqual(["collect", "analyze", "label", "plan", "briefing"]);
    expect(statuses()).toEqual({ collect: "ok", analyze: "ok", label: "ok", cluster: "skipped", plan: "ok", briefing: "ok" });
    expect(closing?.status).toBe("succeeded");
    expect(written?.outcome).toBeUndefined();
    // İnceleme sayacı satıra yazıldı (n/19).
    expect(fake.patches.some((patch) => (patch.progress as { done: number; total: number } | null | undefined)?.total === ONBOARDING_ANALYZE_LIMIT)).toBe(true);
  });

  it("karar taze durumdan: incelenecek video yoksa inceleme atlanır, plan zaten varsa yeniden üretilmez ve hazır sayılır", async () => {
    const { routine, closing, statuses } = await runOnboarding("build", {}, { state: () => ({ analysis: { selectable: 0 }, labeling: { eligible: 0 }, plan: { exists: true, status: "ready" } }) });
    expect(routine.steps.analyze).not.toHaveBeenCalled();
    expect(routine.steps.plan).not.toHaveBeenCalled();
    expect(statuses()).toMatchObject({ analyze: "skipped", label: "skipped", plan: "skipped", briefing: "ok" });
    expect(closing?.status).toBe("succeeded");
  });

  it("açı etiketi hesap türüne göre: içerik üreticisinde etiket atlanır, konu kümeleme koşar", async () => {
    const { routine, statuses } = await runOnboarding("build", {}, { state: () => ({ accountType: "creator", clustering: { available: true, clusteredCount: 0 } }) });
    expect(routine.steps.label).not.toHaveBeenCalled();
    expect(routine.steps.cluster).toHaveBeenCalledTimes(1);
    expect(statuses()).toMatchObject({ label: "skipped", cluster: "ok" });
  });

  it("durum okunamazsa o adım başarısız yazılır, sıradaki adım yine denenir", async () => {
    let loads = 0;
    const { routine, statuses, closing } = await runOnboarding("build", {}, {
      state: () => {
        loads += 1;
        if (loads === 1) throw new Error("db zaman aşımı");
        return {};
      },
    });
    expect(statuses().analyze).toBe("failed");
    expect(routine.steps.analyze).not.toHaveBeenCalled();
    expect(routine.steps.plan).toHaveBeenCalledTimes(1);
    expect(closing).toMatchObject({ status: "partial", result: { outcome: "step_failed" } });
  });
});

describe("ilk tur: kapanış kodları", () => {
  it("plan çıkmazsa partial + plan_not_ready; notlar yine yazılır", async () => {
    const { closing, routine, statuses } = await runOnboarding("build", {}, { runners: planNotSaved });
    expect(closing).toMatchObject({ status: "partial", result: { outcome: "plan_not_ready" } });
    expect(statuses().plan).toBe("skipped");
    expect(routine.steps.briefing).toHaveBeenCalledTimes(1);
  });

  it("tek hedefin hatası diğerlerini durdurmaz: toplama adımı başarısız yazılır, tur sürer; plan hazırsa partial + step_failed", async () => {
    const { closing, routine, step } = await runOnboarding("build", {}, { deps: { collect: async () => collected(25, [25, "Koşu tamamlanmadı: zaman aşımı", 25], 0.27) } });
    expect(step("collect")).toMatchObject({ status: "failed", code: "step_failed" });
    expect(routine.steps.analyze).toHaveBeenCalledTimes(1);
    expect(routine.steps.plan).toHaveBeenCalledTimes(1);
    expect(closing).toMatchObject({ status: "partial", result: { outcome: "step_failed" } });
  });

  it("toplama tavanı aşarsa koşu başlamaz; tur eldeki veriyle sürer", async () => {
    const over: CollectSummary = { outcome: "blocked", targets: [], runs: [], cost: { reservedUsd: 0, pendingReconcile: 0 }, notes: [] };
    const { closing, routine, step } = await runOnboarding("build", {}, { deps: { collect: async () => over } });
    expect(step("collect")).toMatchObject({ status: "needs_approval", code: "over_approved_amount" });
    expect(routine.steps.analyze).toHaveBeenCalledTimes(1);
    expect(closing).toMatchObject({ status: "partial", result: { outcome: "step_failed" } });
  });

  it("hiçbir şey üretilmediyse iş failed kapanır (ilk tur hakkı boş koşuyla harcanmaz)", async () => {
    const { closing } = await runOnboarding("build", {}, {
      deps: { collect: async () => Promise.reject(new Error("Apify yanıt vermedi")) },
      state: () => ({ analysis: { selectable: 0 }, labeling: { eligible: 0 } }),
      runners: planNotSaved,
    });
    expect(closing).toMatchObject({ status: "failed", result: { outcome: "step_failed" } });
  });

  it("inceleme için adres yoksa (yeniden toplama gerekli) adım kodla yazılır, tur sürer", async () => {
    const { step, routine, closing } = await runOnboarding("build", {}, {
      runners: runnersWith((routine) => ({
        analyze: async () => {
          routine().wirings[0].onAnalyzed?.(analyzeSummary({ outcome: "needs_recollect", ok: 0, selected: 5, expired: 5 }));
          return { status: "needs_approval", reason: "Seçilen videoların adresi dolmuş." };
        },
      })),
    });
    expect(step("analyze")).toMatchObject({ status: "needs_approval", code: "needs_recollect" });
    expect(routine.steps.plan).toHaveBeenCalledTimes(1);
    expect(closing).toMatchObject({ status: "partial", result: { outcome: "step_failed" } });
  });

  it("bir adım fırlatırsa iş düşmez: adım başarısız, sıradakiler koşar", async () => {
    const { statuses, routine, closing } = await runOnboarding("build", {}, { runners: runnersWith(() => ({ label: async () => Promise.reject(new Error("beklenmeyen")) })) });
    expect(statuses().label).toBe("failed");
    expect(routine.steps.plan).toHaveBeenCalledTimes(1);
    expect(closing).toMatchObject({ status: "partial", result: { outcome: "step_failed" } });
  });

  it("harcama özeti işe bağlı koşulardan gelir; alınamazsa toplamanınki kalır", async () => {
    const settled = await runOnboarding("build", {}, { deps: { settleSpend: async () => ({ reservedUsd: 0.25, actualUsd: 0.25, pending: 0 }) } });
    expect(settled.written?.spend).toEqual({ reservedUsd: 0.25, actualUsd: 0.25 });
    expect(settled.deps.settleSpend.mock.calls[0][2]).toMatchObject({ waitMs: 0 });
    const failed = await runOnboarding("build", {}, { deps: { collect: async () => collected(25, [], 0.07), settleSpend: async () => Promise.reject(new Error("db yok")) } });
    expect(failed.written?.spend).toEqual({ reservedUsd: 0.07 });
  });
});

describe("ilk tur: yazı aracı kalıcı olarak kullanılamıyor", () => {
  const llmDown = runnersWith(() => ({ label: async () => ({ status: "failed", reason: "Yazı aracı oturumu yok.", llmUnavailable: true }) }));

  it("kalan yazı adımları denenmez; inceleme yapıldıysa partial + plan_not_ready", async () => {
    const { routine, steps, closing } = await runOnboarding("build", {}, { runners: llmDown });
    for (const id of ["cluster", "plan", "briefing"] as const) expect(routine.steps[id], id).not.toHaveBeenCalled();
    expect(steps.filter((step) => step.code === "llm_unavailable").map((step) => step.id)).toEqual(["label", "cluster", "plan", "briefing"]);
    expect(closing).toMatchObject({ status: "partial", result: { outcome: "plan_not_ready" } });
  });

  it("hiçbir şey üretilmediyse blocked + llm_unavailable (yeniden başlatılabilir)", async () => {
    const { closing } = await runOnboarding("build", {}, { runners: llmDown, state: () => ({ analysis: { selectable: 0 } }), deps: { collect: async () => Promise.reject(new Error("Apify yok")) } });
    expect(closing).toMatchObject({ status: "blocked", result: { outcome: "llm_unavailable" } });
  });
});

describe("ilk tur: iptal ve süre tavanı", () => {
  it("inceleme sürerken iptal: çalışan adım biter, sonraki adımlar başlamaz, iş cancelled", async () => {
    let cancel = () => {};
    const { routine, closing, statuses } = await runOnboarding("build", {}, {
      arrange: (fake) => {
        cancel = () => fake.requestCancel();
      },
      runners: runnersWith((routine) => ({
        analyze: async () => {
          cancel();
          routine().wirings[0].onAnalyzed?.(analyzeSummary());
          return ok();
        },
      })),
    });
    expect(closing?.status).toBe("cancelled");
    for (const id of ["label", "cluster", "plan", "briefing"] as const) expect(routine.steps[id], id).not.toHaveBeenCalled();
    expect(statuses()).toMatchObject({ analyze: "ok", label: "pending", plan: "pending" });
  });

  it("inceleme videolar arasında durduysa (başlatılmayan video var) iş kesilmiş sayılır", async () => {
    let cancel = () => {};
    const { routine, closing } = await runOnboarding("build", {}, {
      arrange: (fake) => {
        cancel = () => fake.requestCancel();
      },
      runners: runnersWith((routine) => ({
        analyze: async () => {
          cancel();
          await routine().wirings[0].analyzeHooks?.onProgress?.({ done: 2, total: 19 }); // yazım iptali ortaya çıkarır
          expect(routine().wirings[0].analyzeHooks?.shouldStop?.()).toBe(true);
          routine().wirings[0].onAnalyzed?.(analyzeSummary({ ok: 2, selected: 19, skippedByCap: 17 }));
          return ok();
        },
      })),
    });
    expect(closing?.status).toBe("cancelled");
    expect(routine.steps.label).not.toHaveBeenCalled();
  });

  it("süre tavanı dolmuşsa toplama bile başlamaz: failed + timeout, para harcanmaz", async () => {
    const { deps, closing } = await runOnboarding("build", {}, { timeoutMs: 0 });
    expect(closing).toMatchObject({ status: "failed", result: { outcome: "timeout" } });
    expect(deps.collect).not.toHaveBeenCalled();
  });
});

describe("ilk tur: kredi", () => {
  it("zorlama kapalı: hiçbir kredi çağrısı yapılmaz, hesap sayısı okunmaz", async () => {
    const { credits, deps, written } = await runOnboarding("build");
    expect(credits.lookups).toEqual([]);
    expect(credits.settled).toEqual([]);
    expect(deps.collectTargetCount).not.toHaveBeenCalled();
    expect(written?.credits).toBeUndefined();
  });

  it("zorlama açık: tamamlanan birimler düşülür (hesap, video, plan, notlar); kalan serbest", async () => {
    const { credits, written, closing } = await runOnboarding("build", {}, { reserved: 300, deps: { collect: async () => collected(25, [25, 25, "hata"], 0.27) } });
    expect(closing?.status).toBe("partial"); // bir rakip düştü
    expect(credits.settled).toMatchObject([{ actual: 3 * 8 + 3 * 10 + 60 + 4, units: { account_scan: 3, video_review: 3, weekly_plan: 1, briefing: 1 } }]);
    expect(written?.credits).toMatchObject({ reserved: 300, due: 118, charged: 118 });
  });

  it("kredi yetmeyen adım başlamaz (credits_exhausted), sığan adımlar koşar; inceleme sığan video sayısıyla sınırlanır", async () => {
    const seen: { analyzeLimit?: number } = {};
    // 60 kredi: 4 hesap (32) sığar → kalan 28: en çok 2 video (20) → kalan 8: plan (60) sığmaz, notlar (4) sığar.
    const { routine, steps, closing, deps } = await runOnboarding("build", {}, { reserved: 60, deps: { collect: async () => collected(25, [25, 25, 25], 0.27) }, runners: (r) => ({ ...buildRunners(r, seen), analyze: async () => {
      seen.analyzeLimit = r().wirings[0].analyzeLimit?.();
      r().wirings[0].onAnalyzed?.(analyzeSummary({ ok: 2, selected: 2, skippedByCap: 3 }));
      return ok();
    } }) });
    expect(deps.collectTargetCount).toHaveBeenCalledTimes(1);
    expect(seen.analyzeLimit).toBe(2);
    expect(routine.steps.plan).not.toHaveBeenCalled();
    expect(steps.find((step) => step.id === "plan")).toMatchObject({ status: "skipped", code: "credits_exhausted" });
    expect(routine.steps.briefing).toHaveBeenCalledTimes(1);
    expect(closing).toMatchObject({ status: "partial", result: { outcome: "plan_not_ready" } });
  });

  it("toplama krediye sığmıyorsa Apify'a gidilmez", async () => {
    const { deps, step } = await runOnboarding("build", {}, { reserved: 20 });
    expect(deps.collect).not.toHaveBeenCalled();
    expect(step("collect")).toMatchObject({ status: "skipped", code: "credits_exhausted" });
  });
});
