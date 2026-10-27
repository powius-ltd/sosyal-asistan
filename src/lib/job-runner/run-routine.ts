/**
 * Haftalık tur işi: mevcut `runRoutine` + `createRoutineDeps`'i SARAR (yeniden yazmaz; `orchestrator/**` değişmez). Sarmalayıcı yalnız
 * şunları ekler: adım ilerlemesini satıra yazmak, adım sınırında durmak, harcama tavanını satırdaki onaydan vermek.
 *
 * - Karar adımları (atlanan / onay bekleyen) `planRoutine` kararından ÖNCEDEN yazılır (önkontrol sarmalayıcısı planı alır).
 * - Toplama: `RoutineArgs.apifyMaxUsd` YALNIZ `routineCollectMaxUsd` (satırdaki geçerli, taze, tek seferlik onay); yoksa `planRoutine`
 *   adımı "onay bekliyor" bırakır ve toplama işlevi hiç çağrılmaz. Onay eskimişse adım `approval_expired` koduyla yazılır.
 * - Durma (iptal / süre tavanı): sıradaki adım BAŞLATILMAZ (satırda `pending` kalır), rapor ve bildirim yazılmaz; inceleme adımı videolar
 *   arasında da durur (turun KENDİ inceleme adımı işçi kancalarıyla koşar: `RoutineWiring.analyzeHooks` / `onAnalyzed`).
 * - Önizleme (`dryRun`): `runRoutine` yalnız durumu okur ve karar verir; önkontrol, adım, rapor çağrılmaz. Tahmine birim sayıları da
 *   yazılır (`routine-units.ts`: taranacak hesap, incelenecek video): kredi tahmini bunlardan hesaplanır.
 * - Kredi (yalnız krediye bağlı işte): kredi harcayan adım (toplama, inceleme, plan, notlar) kalan krediye sığmıyorsa BAŞLATILMAZ (satırda
 *   `skipped` + `credits_exhausted`), sonraki adımlar denenir; inceleme kalan krediye sığan video sayısıyla sınırlanır; tamamlanan birimler
 *   sayaca işlenir (turun kendi adımlarının kancalarıyla: `onCollected` / `onAnalyzed` / `onPlanned`). Kredi yüzünden eksik kalan tur `partial`.
 */
import "server-only";

import path from "node:path";

import { isUsdApprovalBasis, type JobStep, type JobStepId, type PanelJob } from "@/lib/domain/panel-job";
import { DEFAULT_CONCURRENCY } from "@/lib/intel/call-budget";
import type { IntelContext } from "@/lib/intel/context";
import { unboundMeter, type CreditMeter } from "@/lib/job-runner/credit-meter";
import { savedPlans, scannedAccounts } from "@/lib/job-runner/credit-units";
import type { JobRunnerDeps } from "@/lib/job-runner/deps";
import type { JobFinal, JobSession } from "@/lib/job-runner/job-session";
import { estimateOf, routineFinal, stepOfOutput } from "@/lib/job-runner/outcome-map";
import { affordableVideos, analyzeHooks, creditShortNote, cutFinal, markAnalysisCut, meterAnalysis, secondsSince, withCreditVerdict } from "@/lib/job-runner/run-single";
import { routineMayCollect, routinePreviewUnits } from "@/lib/job-runner/routine-units";
import { routineCollectMaxUsd } from "@/lib/job-runner/spend-gate";
import { isLlmUnavailableError } from "@/lib/orchestrator/llm-failure";
import { runRoutine, type RoutineDeps, type StepRunner } from "@/lib/orchestrator/routine";
import { briefingRunnerOf, clusterRunnerOf } from "@/lib/orchestrator/step-runners";
import { ROUTINE_STEPS, type PlanEntry, type RoutineStepId, type StepOutput, type StepResult } from "@/lib/orchestrator/types";

const REPORT_LINE = /^Rapor: (.+)$/;
const STOPPED: StepOutput = { status: "skipped", reason: "Durduruldu: adım başlatılmadı." };
const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : "bilinmeyen hata");

/** Rapor satırındaki mutlak yol → depo köküne göre yol (yönetici görür). */
function reportPathOf(lines: readonly string[], rootDir: string): string | undefined {
  const file = lines.map((line) => REPORT_LINE.exec(line)?.[1]).find((found) => found !== undefined);
  return file === undefined ? undefined : path.relative(rootDir, file).replaceAll("\\", "/") || undefined;
}

export async function runRoutineJob(job: PanelJob, ctx: IntelContext, session: JobSession, deps: JobRunnerDeps, clockMs: () => number, meter: CreditMeter = unboundMeter()): Promise<JobFinal> {
  const log = session.log;
  const apifyMaxUsd = routineCollectMaxUsd(job, ctx.now);
  // Yalnız kredi onayı taşıyan tur "onayı eskimiş" değildir: USD onayı hiç verilmemiştir (toplama adımı zaten onay bekler).
  const approvalExpired = !job.dryRun && isUsdApprovalBasis(job.approval?.basis) && apifyMaxUsd === undefined;
  if (approvalExpired) log("Onay geçersiz ya da 24 saatten eski: toplama adımı çalıştırılmayacak (yeniden onay gerekir).");

  /** Plan kararı → satıra önceden yazılan adım. Çalışacak adım `pending` (nedeni notta), diğerleri kararın kendisi. */
  const decided = ({ step, decision }: PlanEntry): JobStep => {
    if (decision.action === "run") return { id: step, status: "pending", note: decision.reason };
    if (decision.action === "skip") return { id: step, status: "skipped", note: decision.reason, seconds: 0 };
    return {
      id: step,
      status: "needs_approval",
      note: decision.reason,
      seconds: 0,
      ...(step === "collect" && approvalExpired ? { code: "approval_expired" as const } : {}),
      ...(decision.estimateUsd === undefined ? {} : { spend: { estimateUsd: decision.estimateUsd } }),
    };
  };

  /** Sarmalayıcının başlattığı adımlar (tur bittiğinde satırla rapor bunun dışındakiler için eşitlenir). */
  const started = new Set<JobStepId>();
  /** Durma yüzünden başlatılmayan adımlar: satırda `pending` kalır. */
  const refused = new Set<JobStepId>();

  /** İncelemenin bu turdaki video tavanı (adım başlarken kalan krediye göre belirlenir). */
  let analyzeLimit = affordableVideos(meter);
  /** Kredi kapısı: adım kalan krediye sığmıyorsa nedeni (adım başlatılmaz). Krediye bağlı olmayan işte hiçbir şey sorulmaz / okunmaz. */
  const creditShortfall = async (id: JobStepId): Promise<string | undefined> => {
    if (!meter.bound) return undefined;
    if (id === "collect") {
      const accounts = await deps.collectTargetCount(ctx);
      return meter.canAfford("account_scan", accounts) ? undefined : creditShortNote(meter, `${accounts} hesaba bakılacak`);
    }
    if (id === "analyze") return (analyzeLimit = affordableVideos(meter)) > 0 ? undefined : creditShortNote(meter, "tek video bile sığmıyor");
    if (id === "plan") return meter.canAfford("weekly_plan") ? undefined : creditShortNote(meter, "bir plan hazırlanacak");
    if (id === "briefing") return meter.canAfford("briefing") ? undefined : creditShortNote(meter, "notlar güncellenecek");
    return undefined;
  };

  const tracked = <A extends unknown[]>(id: JobStepId, run: (...args: A) => Promise<StepOutput>, before?: (...args: A) => Promise<void>, onStop: StepOutput = STOPPED) => async (...args: A): Promise<StepOutput> => {
    await before?.(...args);
    const shortfall = session.shouldStop() ? undefined : await creditShortfall(id);
    if (shortfall !== undefined) {
      meter.markExhausted();
      log(shortfall);
      await session.finishStep(id, { status: "skipped", code: "credits_exhausted", note: shortfall, seconds: 0 });
      return { status: "skipped", reason: shortfall };
    }
    // Adım sınırı: durma istenmişse (ya da "sürüyor" yazımı durmayı ortaya çıkarırsa) adım başlatılmaz.
    if (!(await session.tryStartStep(id))) {
      refused.add(id);
      return onStop;
    }
    started.add(id);
    const t0 = clockMs();
    let output: StepOutput;
    try {
      output = await run(...args);
    } catch (error) {
      await session.finishStep(id, { status: "failed", note: errorMessage(error), seconds: secondsSince(t0, clockMs()), ...(isLlmUnavailableError(error) ? { code: "llm_unavailable" as const } : {}) });
      throw error; // `runRoutine` adımı failed sayar ve sıradakine geçer
    }
    if (id === "briefing" && output.status === "ok") meter.add("briefing", 1);
    await session.finishStep(id, { ...stepOfOutput(output, output.llmUnavailable ? "llm_unavailable" : undefined), seconds: secondsSince(t0, clockMs()) });
    return output;
  };

  const base = deps.routineDeps(ctx, {
    args: { dryRun: job.dryRun, concurrency: DEFAULT_CONCURRENCY, ...(apifyMaxUsd === undefined ? {} : { apifyMaxUsd }) },
    log,
    runBriefing: briefingRunnerOf(deps.briefing),
    clusterOnly: clusterRunnerOf(deps.cluster),
    // İnceleme turun kendi adımıdır; işçi yalnız kancaları verir (sayaç, videolar arası durma) ve kesilip kesilmediğini öğrenir.
    analyzeHooks: analyzeHooks(session),
    onAnalyzed: (summary) => {
      meterAnalysis(meter, analyzeLimit, summary);
      markAnalysisCut(session, summary.skippedByCap);
    },
    // Kredi kancaları: yalnız krediye bağlı işte verilir (bağlı olmayan tur panel tavanıyla, kancasız koşar).
    ...(meter.bound
      ? {
          analyzeLimit: () => analyzeLimit,
          onCollected: (summary) => meter.add("account_scan", scannedAccounts(summary)),
          onPlanned: (result) => meter.add("weekly_plan", savedPlans(result)),
        }
      : {}),
  });
  const steps = Object.fromEntries(ROUTINE_STEPS.map((id) => [id, tracked(id, base.steps[id])])) as Record<RoutineStepId, StepRunner>;

  let reportPath: string | undefined;
  const wrapped: RoutineDeps = {
    ...base,
    dryRun: job.dryRun,
    log,
    steps,
    precheck: tracked(
      "precheck",
      base.precheck,
      async (_state, plan) => session.setSteps([{ id: "precheck", status: "pending" }, ...plan.map(decided)]),
      { status: "failed", reason: "Durduruldu: önkontrol başlatılmadı." },
    ),
    writeReport: async (report) => {
      // Yarıda kesilen tur "tamamlandı" raporu / bildirimi üretmez (son adım sırasında gelen iptal turu kesmez: rapor yazılır).
      if (session.wasCut() || session.stopReason() === "lost") return ["Rapor ve bildirim yazılmadı: iş yarıda durdu."];
      const lines = await base.writeReport(report);
      reportPath = reportPathOf(lines, process.cwd());
      return lines;
    },
  };

  const report = await runRoutine(wrapped);
  if (session.stopReason() === "lost") return { status: "failed" }; // yazılamaz; çağıran çit kaybını ayrıca görür

  // Önizleme: kararlar adım olarak yazılır (durum okunamadıysa plan yoktur; o hâl aşağıda önkontrol hatası olarak yazılır).
  if (report.dryRun && report.plan !== undefined) {
    const plan = report.plan;
    await session.setSteps(plan.map(decided));
    const reference = plan.flatMap(({ step, decision }) => (step === "collect" && decision.action === "needs_approval" && decision.estimateUsd !== undefined ? [decision.estimateUsd] : []))[0];
    // Birim sayıları (kredi tahmini): hesap sayısı yalnız toplama atlanmıyorsa okunur; okunamazsa alan yazılmaz (tahmin "bilinmiyor" çıkar).
    let accounts: number | undefined;
    if (routineMayCollect(plan)) {
      try {
        accounts = await deps.collectTargetCount(ctx);
      } catch (error) {
        log(`Taranacak hesap sayısı okunamadı (kredi tahmini eksik kalır): ${errorMessage(error)}`);
      }
    }
    // Referans tutar yoksa döküm satırı da yoktur: tahmin yalnız birim sayılarını taşır (ekran boş tutar satırı çizmez).
    const lines = reference === undefined ? [] : [{ label: "Hesaba bakış (son bakışın tutarı; referans)", usd: reference }];
    return routineFinal(report, { estimate: estimateOf(reference, lines, routinePreviewUnits(plan, report.state, accounts)) });
  }

  // Sarmalayıcının görmediği sonuçlar: durum okunamadı (önkontrol satırı) ve kalıcı yazı aracı hatasından sonra denenmeyen adımlar.
  const written = new Map(session.steps().map((step) => [step.id, step]));
  const llmDown = report.steps.some((step) => step.llmUnavailable === true);
  const missing = (result: StepResult): boolean => !started.has(result.step) && !refused.has(result.step) && written.get(result.step)?.status !== result.status;
  for (const result of report.steps.filter(missing)) {
    const code = llmDown && result.status === "skipped" && written.get(result.step)?.status === "pending" ? ("llm_unavailable" as const) : undefined;
    await session.finishStep(result.step, { ...stepOfOutput(result, code), seconds: result.seconds });
  }

  if (session.wasCut()) return cutFinal(session);
  const collect = report.steps.find((step) => step.step === "collect");
  const final = routineFinal(report, {
    ...(reportPath === undefined ? {} : { reportPath }),
    ...(collect?.spend?.actualUsd === undefined ? {} : { spend: { actualUsd: collect.spend.actualUsd } }),
  });
  // Önkontrol / durum okuma hatasında neden işin hata metnine de yazılır (yönetici görür).
  const precheck = report.steps.find((step) => step.step === "precheck" && step.status === "failed");
  return precheck === undefined ? withCreditVerdict(final, meter) : { ...final, error: precheck.reason };
}
