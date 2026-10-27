/**
 * Tek adımlı işler (`collect`, `measure`, `analyze`, `label`, `plan`, `briefing`) ve bunların önizlemesi (`dryRun`; yalnız toplama ve
 * ölçümde). Mevcut `runX` işlevini çağırır, adımı satıra yazar, özeti hükme çevirir (`outcome-map.ts`).
 *
 * HARCAMA KAPISI: gerçek toplama / ölçüm `spendGate` açık değilse HİÇ çağrılmaz (iş `blocked`); açıksa tavan satırdaki tutardır.
 * ÖNİZLEME: yalnız kuru koşu çağrılır (`dryRun: true`): koşu başlamaz, DB'ye yazılmaz, yazı / video aracı çağrılmaz.
 * İPTAL: adım başlamadan önce sorulur; video incelemede videolar arasında (`analyzeArgs` kancaları). Başlamış toplama kesilmez.
 * KREDİ (yalnız krediye bağlı işte; `credit-meter.ts`): adım ayrılan krediye sığmıyorsa HİÇ başlamaz (`blocked` + `insufficient_credits`);
 * video inceleme kalan krediye sığan sayıyla sınırlanır (sığmayan video kalırsa iş `partial` + `credits_exhausted`); tamamlanan birim sayılır.
 */
import "server-only";

import { JOB_SPEND_MAX_USD, JOB_STEPS_BY_KIND, type JobKind, type JobStepId, type PanelJob } from "@/lib/domain/panel-job";
import { DEFAULT_ANALYZE_LIMIT } from "@/lib/intel/analysis-select";
import type { AnalyzeSummary } from "@/lib/intel/analyze-run";
import type { AnalyzeArgs } from "@/lib/intel/args";
import { DEFAULT_CONCURRENCY } from "@/lib/intel/call-budget";
import type { IntelContext } from "@/lib/intel/context";
import type { CreditItem } from "@/lib/domain/credit-pricing";
import { unboundMeter, type CreditMeter } from "@/lib/job-runner/credit-meter";
import { discoveredAccounts, measuredAccounts, reviewedVideos, savedPlans, scannedAccounts, writtenBriefings } from "@/lib/job-runner/credit-units";
import { runAdsSync } from "@/lib/ads/sync-job";
import type { JobRunnerDeps } from "@/lib/job-runner/deps";
import type { JobFinal, JobSession } from "@/lib/job-runner/job-session";
import { analyzeVerdict, briefingVerdict, collectVerdict, labelVerdict, measureVerdict, planVerdict, type JobVerdict } from "@/lib/job-runner/outcome-map";
import { adsSyncVerdict } from "@/lib/job-runner/outcome-map-ads";
import { discoverJobVerdict, orderReturnVerdict, orderVerdict, publishVerdict, zernioVerdict } from "@/lib/job-runner/outcome-map-halka";
import { loadAgentBudget } from "@/lib/agents/director/budget";
import { spendGate } from "@/lib/job-runner/spend-gate";
import { tapLlmFailure } from "@/lib/orchestrator/llm-failure";

/** Tek adımlı işler: haftalık tur ve başlangıç işi (çok adımlı; kendi koşucuları var) dışındakiler. */
export type SingleJobKind = Exclude<JobKind, "routine" | "onboarding">;

/** Süre (sn, bir ondalık). */
export const secondsSince = (startedMs: number, nowMs: number): number => Math.max(0, Math.round((nowMs - startedMs) / 100) / 10);

/** İşçinin video inceleme kancaları: sayaç satıra yazılır, durma videolar arasında sorulur. Haftalık turun inceleme adımı da bunları alır. */
export function analyzeHooks(session: JobSession): Required<Pick<AnalyzeArgs, "onProgress" | "shouldStop">> {
  return { onProgress: (progress) => session.setProgress(progress), shouldStop: () => session.shouldStop() };
}

/** Video incelemenin panel varsayılanları (`--pilot`, `--limit`, `--concurrency` panelde yok) + işçi kancaları. `limit`: krediye sığan sayı. */
export function analyzeArgs(session: JobSession, limit: number = DEFAULT_ANALYZE_LIMIT): AnalyzeArgs {
  return { pilot: false, limit, dryRun: false, concurrency: DEFAULT_CONCURRENCY, ...analyzeHooks(session) };
}

/** İncelemenin video tavanı: kalan krediye sığan sayı (krediye bağlı olmayan işte panel tavanı). */
export const affordableVideos = (meter: CreditMeter): number => meter.affordable("video_review", DEFAULT_ANALYZE_LIMIT);

/**
 * İnceleme özetini sayaca işler: tamamlanan videolar sayılır; kredi tavanı panel tavanının altındaydı ve seçilemeyen video kaldıysa iş
 * "kredi bitti" diye işaretlenir. Tek adımlı iş ve haftalık turun inceleme adımı AYNI fonksiyonu kullanır.
 */
export function meterAnalysis(meter: CreditMeter, limit: number, summary: Pick<AnalyzeSummary, "ok" | "insufficient" | "skippedByCap">): void {
  meter.add("video_review", reviewedVideos(summary));
  if (limit < DEFAULT_ANALYZE_LIMIT && summary.skippedByCap > 0) meter.markExhausted();
}

/** Kredi yüzünden başlatılmayan adımın notu (yönetici görür). */
export const creditShortNote = (meter: CreditMeter, need: string): string => `Ayrılan kredi yetmiyor (${need}; kalan ${meter.remaining()} kredi): adım başlatılmadı.`;

/** Tek adımlı işin kredi kapısı: adım kalan krediye sığıyor mu. Sığmıyorsa nedeni (adım başlatılmaz); sığıyorsa undefined. */
async function creditShortfall(kind: SingleJobKind, job: PanelJob, ctx: IntelContext, deps: JobRunnerDeps, meter: CreditMeter): Promise<string | undefined> {
  if (!meter.bound || job.dryRun) return undefined;
  const one = (item: CreditItem, what: string) => (meter.canAfford(item) ? undefined : creditShortNote(meter, what));
  switch (kind) {
    case "collect": {
      const accounts = await deps.collectTargetCount(ctx);
      return meter.canAfford("account_scan", accounts) ? undefined : creditShortNote(meter, `${accounts} hesaba bakılacak`);
    }
    case "measure":
      return one("measurement", "en az bir hesap ölçülecek");
    case "analyze":
      return affordableVideos(meter) > 0 ? undefined : creditShortNote(meter, "tek video bile sığmıyor");
    case "plan":
      return one("weekly_plan", "bir plan hazırlanacak");
    case "briefing":
      return one("briefing", "notlar güncellenecek");
    case "discover":
      return one("account_scan", "en az bir hesap aranacak");
    case "label":
    case "measure_zernio":
    case "order":
    case "order_return":
    case "publish":
    case "ads_sync":
      return undefined;
  }
}

/** İnceleme durma yüzünden yarıda kesildiyse (başlatılmayan video var) işi "kesildi" diye işaretler. */
export function markAnalysisCut(session: JobSession, skipped: number): void {
  if (skipped > 0 && session.shouldStop()) {
    session.markCut();
    session.log(`Durduruldu: ${skipped} video başlatılmadı.`);
  }
}

/** Durma (iptal / süre tavanı) yüzünden kesilen işin kapanışı. Çit kaybında çağrılmaz (yazılamaz). */
export function cutFinal(session: JobSession): JobFinal {
  return session.stopReason() === "timeout"
    ? { status: "failed", result: { outcome: "timeout" }, error: "Süre tavanı aşıldı: kalan adımlar başlatılmadı." }
    : { status: "cancelled" };
}

/** `agentCap`: tutar satırda değil, çalışma alanının onaylı ajan tavanının kalan hakkındadır (`agentCeiling` çözer). */
type SpendCeiling = { open: true; maxUsd?: number; agentCap?: true } | { open: false; code: "approval_expired" | "approval_missing" | "budget_refused"; note: string };

/**
 * Para harcayan türde (`collect`, `measure`) tavan. Önizleme para harcamaz: toplamada tahminin karşılaştırıldığı üst sınır verilir, ölçümde
 * tutar verilmez. Gerçek koşuda tavan YALNIZ satırdaki onaydan gelir; kapı kapalıysa harcayan işlev hiç çağrılmaz. Diğer türlerde tavan yok.
 */
export function spendCeiling(kind: SingleJobKind, job: Pick<PanelJob, "kind" | "dryRun" | "approval">, now: Date): SpendCeiling {
  if (kind !== "collect" && kind !== "measure" && kind !== "discover") return { open: true };
  if (job.dryRun) return kind === "collect" ? { open: true, maxUsd: JOB_SPEND_MAX_USD } : { open: true };
  const gate = spendGate(job, now);
  if (!gate.open) return gate;
  if ((kind === "collect" || kind === "discover") && gate.basis === "monthly_cap") return { open: true, agentCap: true };
  if ((kind === "collect" || kind === "discover") && gate.maxUsd === undefined) return { open: false, code: "approval_missing", note: "Onaylı tutar yok: ücretli adım başlatılmadı." };
  return { open: true, maxUsd: gate.maxUsd };
}

/**
 * Ajan tavanı dayanağında (`monthly_cap`) harcama tavanını ÇALIŞMA ALANINDAN çözer: satırda tutar yoktur, ajan kendi payını belirleyemez.
 * Tavan onaysız / kapalı ya da kalan hak 0 ise iş `budget_refused` ile durur; aksi halde tavan = min(kalan hak, tek seferlik üst sınır).
 */
async function agentCeiling(ctx: IntelContext): Promise<SpendCeiling> {
  const budget = await loadAgentBudget(ctx.client, ctx.workspaceId, ctx.now);
  if (!budget.approved || budget.remainingUsd <= 0) {
    return { open: false, code: "budget_refused", note: budget.approved ? "Ajan tavanında bu ay kalan hak yok: para harcayan koşu başlatılmadı." : "Ajan tavanı onaylı değil: para harcayan koşu başlatılmadı." };
  }
  return { open: true, maxUsd: Math.min(budget.remainingUsd, JOB_SPEND_MAX_USD) };
}

async function runKind(kind: SingleJobKind, job: PanelJob, ctx: IntelContext, session: JobSession, deps: JobRunnerDeps, maxUsd: number | undefined, meter: CreditMeter): Promise<JobVerdict> {
  const log = session.log;
  switch (kind) {
    case "collect": {
      const summary = await deps.collect({ workspaceId: ctx.workspaceId, limit: job.params.limit, maxUsd, dryRun: job.dryRun, now: ctx.now, log });
      meter.add("account_scan", scannedAccounts(summary));
      return collectVerdict(summary);
    }
    case "measure": {
      const result = await deps.measure({ workspaceId: ctx.workspaceId, now: ctx.now, dryRun: job.dryRun, maxUsd, log });
      meter.add("measurement", measuredAccounts(result));
      const basis = job.approval?.basis;
      return measureVerdict(result, basis === "one_time" || basis === "monthly_cap" ? basis : undefined);
    }
    case "analyze": {
      const limit = affordableVideos(meter);
      const summary = await deps.analyze(ctx, analyzeArgs(session, limit), log);
      meterAnalysis(meter, limit, summary);
      markAnalysisCut(session, summary.skippedByCap);
      return analyzeVerdict(summary);
    }
    case "label": {
      const tap = tapLlmFailure(log);
      return labelVerdict(await deps.label(ctx, { dryRun: false }, tap.log), tap.tripped);
    }
    case "plan": {
      const result = await deps.plan(ctx, { week: job.params.week, dryRun: false }, log);
      meter.add("weekly_plan", savedPlans(result));
      return planVerdict(result, deps.writePlanMarkdown(ctx, result));
    }
    case "measure_zernio":
      return zernioVerdict(await deps.measureZernio(ctx, { dryRun: false, log }));
    case "order": {
      const week = job.params.week;
      if (week === undefined) throw new Error("Sipariş işinde hafta yok: iş koşturulmadı.");
      return orderVerdict(await deps.writeOrders(ctx, { week, log, ...(job.params.slot === undefined ? {} : { slot: job.params.slot }), ...(job.params.ideaId === undefined ? {} : { ideaId: job.params.ideaId }) }));
    }
    case "order_return":
      return orderReturnVerdict(await deps.returnOrders(ctx, { log }));
    case "publish":
      return publishVerdict(await deps.publishOrders(ctx, { log }));
    case "ads_sync":
      return adsSyncVerdict(await runAdsSync({ client: ctx.client, workspaceId: ctx.workspaceId, workspaceSlug: ctx.workspaceSlug, now: ctx.now, env: process.env, log }));
    case "discover": {
      const summary = await deps.discover({ client: ctx.client, workspaceId: ctx.workspaceId, maxUsd: maxUsd ?? 0, now: ctx.now, log });
      meter.add("account_scan", discoveredAccounts(summary));
      return discoverJobVerdict(summary);
    }
    case "briefing": {
      const result = await deps.briefing(ctx, { log });
      meter.add("briefing", writtenBriefings(result));
      return briefingVerdict(result);
    }
  }
}

/** Kredi yarıda bittiyse (başlatılmayan video / adım var) temiz biten iş `partial` + `credits_exhausted` kapanır; diğer hükümler değişmez. */
export function withCreditVerdict(final: JobFinal, meter: CreditMeter): JobFinal {
  if (!meter.exhausted() || final.status !== "succeeded") return final;
  return { ...final, status: "partial", result: { ...final.result, outcome: "credits_exhausted" } };
}

export async function runSingleJob(kind: SingleJobKind, job: PanelJob, ctx: IntelContext, session: JobSession, deps: JobRunnerDeps, clockMs: () => number, meter: CreditMeter = unboundMeter()): Promise<JobFinal> {
  const stepId: JobStepId = JOB_STEPS_BY_KIND[kind][0];
  await session.setSteps([{ id: stepId, status: "pending" }]);

  const firstCeiling = spendCeiling(kind, job, ctx.now);
  const ceiling = firstCeiling.open && firstCeiling.agentCap === true ? await agentCeiling(ctx) : firstCeiling;
  if (!ceiling.open) {
    session.log(ceiling.note);
    await session.finishStep(stepId, { status: "needs_approval", code: ceiling.code, note: ceiling.note, seconds: 0 });
    return { status: "blocked", result: { outcome: ceiling.code } };
  }
  // Kredi kapısı: adım ayrılan krediye sığmıyorsa hiç başlamaz (para / kota harcayan işlev çağrılmaz).
  const shortfall = await creditShortfall(kind, job, ctx, deps, meter);
  if (shortfall !== undefined) {
    session.log(shortfall);
    await session.finishStep(stepId, { status: "needs_approval", code: "insufficient_credits", note: shortfall, seconds: 0 });
    return { status: "blocked", result: { outcome: "insufficient_credits" } };
  }

  // Adım sınırı: iş alınır alınmaz durdurulduysa (ya da elden alındıysa) adım hiç başlamaz.
  if (!(await session.tryStartStep(stepId))) return cutFinal(session);
  const t0 = clockMs();
  let verdict: JobVerdict;
  try {
    verdict = await runKind(kind, job, ctx, session, deps, ceiling.maxUsd, meter);
  } catch (error) {
    await session.finishStep(stepId, { status: "failed", note: error instanceof Error ? error.message : "bilinmeyen hata", seconds: secondsSince(t0, clockMs()) });
    throw error;
  }
  await session.finishStep(stepId, { ...verdict.step, seconds: secondsSince(t0, clockMs()) });
  return session.wasCut() ? cutFinal(session) : withCreditVerdict(verdict.final, meter);
}
