/**
 * İşçinin GERÇEK bağlaması: `JobRunnerDeps`'i mevcut `runX` işlevlerine bağlar (onlara dokunmaz, yalnız çağırır). İşçi betiği
 * (`scripts/job-worker.mts`) içe aktarır. Para / kota harcayan modüller buradan gelir: testler sahte bağımlılık verir ve bu dosyayı
 * YÜKLEMEZ. Tek istisna önizleme güvenlik testidir (`preview-safety.db.test.ts`): ağ ve alt süreç korumasının arkasında, yalnız kuru koşu.
 */
import "server-only";

import { collectOnce } from "@/lib/collection/collect-once";
import { discoverCandidates } from "@/lib/collection/discover";
import { createLlmBackend } from "@/lib/llm/backend";
import { verifyOwnAccount } from "@/lib/collection/discover-account";
import { loadTargets } from "@/lib/collection/targets";
import { runAnalysis } from "@/lib/intel/analyze-run";
import { runBriefing } from "@/lib/intel/briefing-run";
import { createIntelContext, missingEnv } from "@/lib/intel/context";
import { runHousekeeping } from "@/lib/intel/housekeeping";
import { runLabeling } from "@/lib/intel/label-run";
import { clusterOnly, runPlan } from "@/lib/intel/plan-run";
import type { JobRunnerDeps } from "@/lib/job-runner/deps";
import { draftNicheForAccount } from "@/lib/job-runner/run-onboarding-niche";
import { settleJobSpend } from "@/lib/job-runner/run-onboarding-settle";
import { createRoutineDeps, savePlanMarkdown } from "@/lib/orchestrator/steps";
import { measureOnce } from "@/lib/outcomes/measure-run";
import { runOrderReturnReal, runPublishReal } from "@/lib/publish/real-run";
import { createStudioRunner } from "@/lib/job-runner/studio-process";
import { sendOrderToStudio } from "@/lib/studio-order/send-to-studio";
import { orderRootOf } from "@/lib/studio-order/order-root";
import { runOrderWrite } from "@/lib/studio-order/run";
import { runZernioMeasure } from "@/lib/outcomes/zernio-job";
import { sweepStaleTempDirs } from "@/lib/video-analysis";

/** Bu süreden eski geçici video klasörü çökmüş bir koşudan kalmıştır (çalışan bir incelemenin klasörüne dokunmayacak kadar büyük). */
const STALE_TEMP_MS = 60 * 60 * 1000;

/** İşçi başında: çökmüş koşulardan kalan rakip videosu klasörlerini siler; silinen klasör sayısı. */
export function sweepWorkerTemp(): number {
  return sweepStaleTempDirs(STALE_TEMP_MS).removed;
}

export function createRealDeps(rootDir: string = process.cwd()): JobRunnerDeps {
  return {
    createContext: (now, workspaceId) => createIntelContext(now, workspaceId),
    missingEnv: (names) => missingEnv(names),
    housekeeping: runHousekeeping,
    collect: (options) => collectOnce(options),
    measure: (options) => measureOnce(options),
    analyze: runAnalysis,
    label: runLabeling,
    plan: runPlan,
    briefing: (ctx, options) => runBriefing(ctx, options),
    cluster: (ctx, log) => clusterOnly(ctx, log),
    routineDeps: createRoutineDeps,
    collectTargetCount: async (ctx) => (await loadTargets(ctx.client, ctx.workspaceId)).targets.length,
    writePlanMarkdown: (ctx, result) => savePlanMarkdown(ctx, result, rootDir),
    verifyAccount: (options) => verifyOwnAccount(options),
    discover: (options) => discoverCandidates(options, { llm: createLlmBackend() }),
    measureZernio: (ctx, options) =>
      runZernioMeasure({ client: ctx.client, workspaceId: ctx.workspaceId, workspaceSlug: ctx.workspaceSlug, now: ctx.now, dryRun: options.dryRun, env: process.env, log: options.log }),
    writeOrders: (ctx, options) =>
      runOrderWrite({ repo: ctx.repo, workspaceId: ctx.workspaceId, workspaceSlug: ctx.workspaceSlug, week: options.week, ordersDir: orderRootOf(), log: options.log, ...(options.slot === undefined ? {} : { slot: options.slot }), ...(options.ideaId === undefined ? {} : { ideaId: options.ideaId }) }),
    returnOrders: (ctx, options) => runOrderReturnReal(ctx, options.onlyOrderId === undefined ? {} : { onlyOrderId: options.onlyOrderId }),
    sendOrder: (ctx, orderId) => sendOrderToStudio({ repo: ctx.repo, wsId: ctx.workspaceId, orderId, panelSlug: ctx.workspaceSlug, now: ctx.now, root: orderRootOf() }),
    runStudio: createStudioRunner(),
    orderRoot: () => orderRootOf(),
    publishOrders: (ctx, options) => runPublishReal(ctx, { log: options.log }),
    draftNiche: (ctx, profile, log) => draftNicheForAccount(ctx, profile, log),
    settleSpend: (ctx, jobId, options) => settleJobSpend({ client: ctx.client, workspaceId: ctx.workspaceId, jobId, ...options }),
  };
}
