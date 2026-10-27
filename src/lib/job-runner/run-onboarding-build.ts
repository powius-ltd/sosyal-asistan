/**
 * Başlangıç işi · `build` ("ilk tur"): `collect → analyze → label → cluster → plan → briefing`.
 *
 * Haftalık turun özel hâli DEĞİLDİR ve onu sarmaz: tur kararlarını baştaki durumdan BİR KEZ verir (boş hesapta inceleme "video yok" diye
 * atlanır). Burada HER adımdan önce durum yeniden okunur (`loadState`) ve o adımın kararı taze durumdan verilir (`planRoutine`, saf): az
 * önce toplanan videolar incelemeye, incelenenler etikete / kümeye / plana girer. Adımların kendisi turun gerçek bağlamasından gelir
 * (`routineDeps(...).steps`: mevcut `runX` işlevleri + adım çevirileri); kopya mantık yoktur.
 *
 *  - collect: kendi hesap + izlenen rakipler (`params.rivalIds` "Başlat" ile izlemeye alınmıştır), hesap başına `ONBOARDING_COLLECT_LIMIT`
 *    video. Tavan YALNIZ satırdaki onaydır. Tek hedefin hatası diğerlerini durdurmaz; toplama düşse de sonraki adımlar eldeki veriyle sürer.
 *  - analyze: toplamadan HEMEN sonra (video adresleri sürelidir), tek parti en çok `ONBOARDING_ANALYZE_LIMIT` video; sayaç satıra yazılır,
 *    videolar arasında durma sorulur.
 *  - Yazı aracı kalıcı olarak kullanılamıyorsa kalan yazı adımları denenmez.
 * Kapanış (`buildFinal`): plan hazır → tamam (bir adım düştüyse kısmi) · plan çıkmadı → kısmi + `plan_not_ready` · hiçbir şey üretilmedi →
 * başarısız (ilk tur hakkı boş koşuyla harcanmaz). KREDİ: adım kalan krediye sığmıyorsa başlamaz (`credits_exhausted`), inceleme sığan video
 * sayısıyla sınırlanır.
 */
import "server-only";

import { ONBOARDING_ANALYZE_LIMIT, ONBOARDING_COLLECT_LIMIT, onboardingStepsOf } from "@/lib/domain/onboarding-job";
import type { JobResult, JobStepId } from "@/lib/domain/panel-job";
import type { AnalyzeSummary } from "@/lib/intel/analyze-run";
import { DEFAULT_CONCURRENCY } from "@/lib/intel/call-budget";
import type { PlanRunResult } from "@/lib/intel/plan-run";
import { reviewedVideos, savedPlans, scannedAccounts } from "@/lib/job-runner/credit-units";
import type { JobFinal } from "@/lib/job-runner/job-session";
import { analyzeVerdict, buildFinal, collectVerdict, planVerdict, stepOfOutput } from "@/lib/job-runner/outcome-map";
import { closeStep, errorMessage, runStep, type OnboardingRun } from "@/lib/job-runner/run-onboarding-steps";
import { analyzeHooks, creditShortNote, cutFinal, markAnalysisCut, withCreditVerdict } from "@/lib/job-runner/run-single";
import { planRoutine } from "@/lib/orchestrator/plan-routine";
import { briefingRunnerOf, clusterRunnerOf } from "@/lib/orchestrator/step-runners";
import type { RoutineState, StepDecision } from "@/lib/orchestrator/types";

/** Toplamadan sonraki adımlar: turun adım kimlikleriyle birebir (ölçüm kontrolü ilk turun işi değildir). */
const AFTER_COLLECT = ["analyze", "label", "cluster", "plan", "briefing"] as const;
type AfterCollect = (typeof AFTER_COLLECT)[number];
/** Yazı aracını kullanan adımlar: kalıcı hatada denenmez. */
const LLM_STEPS: ReadonlySet<JobStepId> = new Set<JobStepId>(["label", "cluster", "plan", "briefing"]);

export async function runOnboardingBuild(run: OnboardingRun): Promise<JobFinal> {
  const { job, ctx, session, deps, meter } = run;
  const log = session.log;
  await session.setSteps(onboardingStepsOf("build").map((id) => ({ id, status: "pending" })));
  log(`İlk tur: ${job.params.rivalIds?.length ?? 0} rakip seçildi; hesap başına ${ONBOARDING_COLLECT_LIMIT} video, en çok ${ONBOARDING_ANALYZE_LIMIT} inceleme.`);

  const tally = { scanned: 0, reviewed: 0, planReady: false, anyFailed: false, llmDown: false };
  const captured: { analysis?: AnalyzeSummary; plan?: PlanRunResult; collectSpend?: JobResult["spend"] } = {};
  let analyzeLimit: number = ONBOARDING_ANALYZE_LIMIT;
  let planNote: string | undefined;

  // Turun gerçek bağlaması: adımlar ve durum okuması buradan gelir. Toplama onayı VERİLMEZ (turun toplama adımı kullanılmaz; aşağıda kendi
  // sınırımızla çağrılır).
  const base = deps.routineDeps(ctx, {
    args: { dryRun: false, concurrency: DEFAULT_CONCURRENCY },
    log,
    runBriefing: briefingRunnerOf(deps.briefing),
    clusterOnly: clusterRunnerOf(deps.cluster),
    analyzeHooks: analyzeHooks(session),
    analyzeLimit: () => analyzeLimit,
    onAnalyzed: (summary) => {
      captured.analysis = summary;
      tally.reviewed += reviewedVideos(summary);
      meter.add("video_review", reviewedVideos(summary));
      if (analyzeLimit < ONBOARDING_ANALYZE_LIMIT && summary.skippedByCap > 0) meter.markExhausted();
      markAnalysisCut(session, summary.skippedByCap);
    },
    onPlanned: (result) => {
      captured.plan = result;
      meter.add("weekly_plan", savedPlans(result));
    },
  });

  // 1 · Toplama (kendi hesap + izlenen rakipler).
  const accounts = meter.bound ? await deps.collectTargetCount(ctx) : 0;
  if (meter.bound && !meter.canAfford("account_scan", accounts)) {
    const note = creditShortNote(meter, `${accounts} hesaba bakılacak`);
    meter.markExhausted();
    log(note);
    await closeStep(session, "collect", { status: "skipped", code: "credits_exhausted", note });
  } else {
    const collect = await runStep(run, "collect", async () => {
      const summary = await deps.collect({ workspaceId: ctx.workspaceId, limit: ONBOARDING_COLLECT_LIMIT, maxUsd: run.maxUsd, now: ctx.now, log });
      tally.scanned = scannedAccounts(summary);
      meter.add("account_scan", tally.scanned);
      const verdict = collectVerdict(summary);
      captured.collectSpend = verdict.final.result?.spend;
      return verdict.step;
    });
    if (collect === undefined) return cutFinal(session);
    // Toplama düşse de (bir hedef, tavan aşımı) tur eldeki veriyle sürer: hesaba bakışta kendi videolar zaten toplandı.
    if (collect.status !== "ok") tally.anyFailed = true;
  }

  /** Adımın kredi kapısı: kalan krediye sığmıyorsa nedeni. */
  const creditShortfall = (id: AfterCollect): string | undefined => {
    if (!meter.bound) return undefined;
    if (id === "analyze") return (analyzeLimit = meter.affordable("video_review", ONBOARDING_ANALYZE_LIMIT)) > 0 ? undefined : creditShortNote(meter, "tek video bile sığmıyor");
    if (id === "plan") return meter.canAfford("weekly_plan") ? undefined : creditShortNote(meter, "bir plan hazırlanacak");
    if (id === "briefing") return meter.canAfford("briefing") ? undefined : creditShortNote(meter, "notlar güncellenecek");
    return undefined;
  };

  // 2–6 · Her adımdan ÖNCE durum yeniden okunur; karar taze durumdan verilir.
  for (const id of AFTER_COLLECT) {
    if (session.shouldStop()) {
      session.markCut();
      return cutFinal(session);
    }
    if (tally.llmDown && LLM_STEPS.has(id)) {
      await closeStep(session, id, { status: "skipped", code: "llm_unavailable", note: "Yazı aracı kalıcı hata verdi (önceki adım): kalan yazı adımları denenmedi." });
      continue;
    }
    let state: RoutineState;
    let decision: StepDecision | undefined;
    try {
      state = await base.loadState();
      decision = planRoutine(state).find((entry) => entry.step === id)?.decision;
    } catch (error) {
      tally.anyFailed = true;
      await closeStep(session, id, { status: "failed", code: "step_failed", note: `Durum okunamadı: ${errorMessage(error)}` });
      continue;
    }
    if (id === "plan" && state.plan.exists) tally.planReady = true;
    if (decision === undefined || decision.action !== "run") {
      await closeStep(session, id, { status: "skipped", note: decision?.reason ?? "Bu adım için karar yok." });
      continue;
    }
    const shortfall = creditShortfall(id);
    if (shortfall !== undefined) {
      meter.markExhausted();
      log(shortfall);
      await closeStep(session, id, { status: "skipped", code: "credits_exhausted", note: shortfall });
      continue;
    }

    const input = { state, planNote };
    const verdict = await runStep(run, id, async () => {
      const output = await base.steps[id](input);
      if (id === "plan") {
        planNote = output.planNote ?? output.reason;
        if (captured.plan?.outcome === "saved" || captured.plan?.outcome === "kept_existing") tally.planReady = true;
      }
      if (id === "briefing" && output.status === "ok") meter.add("briefing", 1);
      const code = output.llmUnavailable
        ? ("llm_unavailable" as const)
        : id === "analyze" && captured.analysis !== undefined
          ? analyzeVerdict(captured.analysis).step.code
          : id === "plan" && captured.plan !== undefined
            ? planVerdict(captured.plan).step.code
            : output.status === "failed"
              ? ("step_failed" as const)
              : undefined;
      return stepOfOutput(output, code);
    });
    if (verdict === undefined || session.wasCut()) return cutFinal(session);
    if (verdict.code === "llm_unavailable") tally.llmDown = true;
    // `needs_approval` burada "yeniden toplama gerekli"dir (video adresi yok / dolmuş): inceleme yapılamadı.
    if (verdict.status === "failed" || verdict.status === "needs_approval") tally.anyFailed = true;
  }

  if (session.stopReason() === "lost") return { status: "failed" }; // yazılamaz; çağıran çit kaybını ayrıca görür

  let spend = captured.collectSpend;
  try {
    // Toplama kendi mutabakatını bekledi: burada tek deneme + işe bağlı koşuların toplamı.
    const settled = await deps.settleSpend(ctx, job.id, { log, waitMs: 0 });
    if (settled.reservedUsd !== undefined) spend = { reservedUsd: settled.reservedUsd, ...(settled.actualUsd === undefined ? {} : { actualUsd: settled.actualUsd }) };
  } catch (error) {
    log(`Uyarı: harcama özeti alınamadı: ${errorMessage(error)}`);
  }
  const final = buildFinal({ planReady: tally.planReady, anyFailed: tally.anyFailed, produced: tally.scanned > 0 || tally.reviewed > 0, llmDown: tally.llmDown }, spend);
  return withCreditVerdict(final, meter);
}
