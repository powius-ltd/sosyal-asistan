/**
 * Başlangıç işi (`onboarding`) koşucusu (plan `docs/BASLANGIC-AKISI-PLAN.md` §3): aşamayı çözer, HARCAMA KAPISINI sorar, aşama koşucusuna
 * devreder (`run-onboarding-probe.ts` "hesaba bakış", `run-onboarding-build.ts` "ilk tur").
 *
 * HARCAMA KAPISI (iki aşamada da ilk iş): tavan YALNIZ satırdaki onaydan gelir (`job.approval`, dayanak `onboarding`; ortam değişkeni /
 * varsayılan yok). Onay yoksa, başka dayanaklaysa, 24 saatten eskiyse ya da tutarı yoksa iş HİÇBİR adımı koşturmadan `blocked` kapanır
 * (para harcayan hiçbir işlev çağrılmaz): başlangıç işinin her aşaması ücretli toplamayla başlar. Satırdaki tutar aşamanın sabit tavanından
 * (`ONBOARDING_PHASE_SPEC`) büyükse sabit tavan uygulanır (DB zaten eşitlik ister; çifte emniyet, tavanı yalnız DÜŞÜREBİLİR).
 * Önizlemesi yoktur (`JOB_KIND_SPEC.onboarding.preview = false`): kuru koşu işi `run-job.ts`'te reddedilir.
 */
import "server-only";

import { ONBOARDING_PHASE_SPEC, onboardingPhaseOf, onboardingStepsOf, type OnboardingPhase } from "@/lib/domain/onboarding-job";
import type { PanelJob } from "@/lib/domain/panel-job";
import type { IntelContext } from "@/lib/intel/context";
import { unboundMeter, type CreditMeter } from "@/lib/job-runner/credit-meter";
import type { JobRunnerDeps } from "@/lib/job-runner/deps";
import type { JobFinal, JobSession } from "@/lib/job-runner/job-session";
import { runOnboardingBuild } from "@/lib/job-runner/run-onboarding-build";
import { runOnboardingProbe } from "@/lib/job-runner/run-onboarding-probe";
import { closeStep, skipRemaining, type OnboardingRun } from "@/lib/job-runner/run-onboarding-steps";
import { spendGate } from "@/lib/job-runner/spend-gate";

/** Aşamanın süre tavanı (dk): `probe` kısa, `build` uzun. Aşama bozuksa undefined (türün tavanı geçerli kalır). */
export function onboardingTimeoutMinutes(job: Pick<PanelJob, "kind" | "params">): number | undefined {
  const phase = onboardingPhaseOf(job);
  return phase === undefined ? undefined : ONBOARDING_PHASE_SPEC[phase].timeoutMinutes;
}

/** Aşamanın harcama tavanı: kapı kapalıysa neden; açıksa satırdaki onaylı tutar (aşamanın sabit tavanını aşamaz). */
export function onboardingCeiling(job: Pick<PanelJob, "kind" | "approval">, phase: OnboardingPhase, now: Date): { open: true; maxUsd: number } | { open: false; code: "approval_expired" | "approval_missing"; note: string } {
  const gate = spendGate(job, now);
  if (!gate.open) return gate;
  if (gate.basis !== "onboarding" || gate.maxUsd === undefined) return { open: false, code: "approval_missing", note: "Başlangıç onayı (sabit tutar) yok: para harcayan koşu başlatılmadı." };
  return { open: true, maxUsd: Math.min(gate.maxUsd, ONBOARDING_PHASE_SPEC[phase].maxUsd) };
}

export async function runOnboardingJob(job: PanelJob, ctx: IntelContext, session: JobSession, deps: JobRunnerDeps, clockMs: () => number, meter: CreditMeter = unboundMeter()): Promise<JobFinal> {
  const phase = onboardingPhaseOf(job);
  if (phase === undefined) {
    const error = "Başlangıç işinin aşaması yok ya da tanınmıyor: iş koşturulmadı, hiçbir şey harcanmadı.";
    session.log(error);
    return { status: "failed", result: { outcome: "error" }, error };
  }

  const ceiling = onboardingCeiling(job, phase, ctx.now);
  if (!ceiling.open) {
    const steps = onboardingStepsOf(phase);
    session.log(ceiling.note);
    await session.setSteps(steps.map((id) => ({ id, status: "pending" })));
    await closeStep(session, steps[0], { status: "needs_approval", code: ceiling.code, note: ceiling.note });
    await skipRemaining(session, steps, "Geçerli onay olmadığı için koşmadı.");
    return { status: "blocked", result: { outcome: ceiling.code } };
  }

  const run: OnboardingRun = { job, ctx, session, deps, clockMs, meter, maxUsd: ceiling.maxUsd };
  return phase === "probe" ? runOnboardingProbe(run) : runOnboardingBuild(run);
}
