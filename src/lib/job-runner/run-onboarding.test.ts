/**
 * Başlangıç işi · ortak kapılar (SAHTE bağımlılıklar): harcama kapısı iki aşamada da ilk iştir; onaysız / bayat / yanlış dayanaklı işte
 * para harcayan HİÇBİR işlev çağrılmaz. Aşama akışları `run-onboarding-probe.test.ts` ve `run-onboarding-build.test.ts`'te.
 */
import { describe, expect, it } from "vitest";

import { ONBOARDING_PHASE_SPEC, ONBOARDING_PHASES, onboardingStepsOf } from "@/lib/domain/onboarding-job";
import { JOB_KIND_SPEC } from "@/lib/domain/panel-job";
import { onboardingCeiling, onboardingTimeoutMinutes } from "@/lib/job-runner/run-onboarding";
import { onboardingApproval, runOnboarding } from "@/lib/job-runner/run-onboarding-test-support";
import { spendGate } from "@/lib/job-runner/spend-gate";
import { approval, claimedJob, NOW } from "@/lib/job-runner/test-support";

/** Para / kota harcayan bağımlılıklar: kapı kapalıyken hiçbiri çağrılmamalı. */
const SPENDERS = ["verifyAccount", "collect", "discover", "draftNiche", "analyze", "label", "plan", "briefing", "cluster", "measure", "routineDeps"] as const;

describe("başlangıç işi: harcama kapısı", () => {
  const closedCases = [
    { name: "onay kaydı yok", approval: undefined, code: "approval_missing" },
    { name: "onay 24 saatten eski", approval: onboardingApproval("build", { minutesAgo: 24 * 60 + 1 }), code: "approval_expired" },
    { name: "başka dayanak (tek seferlik)", approval: approval(0.4), code: "approval_missing" },
    { name: "tutar yok", approval: { ...onboardingApproval("build"), maxUsd: undefined }, code: "approval_missing" },
  ] as const;

  for (const phase of ONBOARDING_PHASES) {
    for (const closed of closedCases) {
      it(`${phase} · ${closed.name}: hiçbir adım koşmaz, iş blocked + ${closed.code}`, async () => {
        const { deps, closing, steps, result } = await runOnboarding(phase, { approval: closed.approval });
        expect(result).toEqual({ status: "blocked", lost: false, abandoned: false });
        expect(closing).toMatchObject({ status: "blocked", result: { outcome: closed.code } });
        for (const name of SPENDERS) expect(deps[name], name).not.toHaveBeenCalled();
        expect(steps.map((step) => step.id)).toEqual(onboardingStepsOf(phase));
        expect(steps[0]).toMatchObject({ status: "needs_approval", code: closed.code });
        expect(steps.slice(1).every((step) => step.status === "skipped")).toBe(true);
      });
    }
  }

  it("tavan YALNIZ satırdaki onaydır; satırdaki tutar aşamanın sabit tavanını aşamaz (yalnız düşürebilir)", () => {
    const job = (maxUsd: number) => claimedJob({ kind: "onboarding", params: { phase: "probe" }, approval: onboardingApproval("probe", { maxUsd }) });
    expect(onboardingCeiling(job(0.2), "probe", NOW)).toEqual({ open: true, maxUsd: 0.2 });
    expect(onboardingCeiling(job(0.05), "probe", NOW)).toEqual({ open: true, maxUsd: 0.05 });
    expect(onboardingCeiling(job(1.5), "probe", NOW)).toEqual({ open: true, maxUsd: ONBOARDING_PHASE_SPEC.probe.maxUsd });
    expect(spendGate({ kind: "collect", approval: onboardingApproval("build") }, NOW), "başlangıç onayı başka türde geçmez").toMatchObject({ open: false, code: "approval_missing" });
  });

  it("aşaması olmayan / bozuk iş koşturulmaz (failed + error), hiçbir şey harcanmaz", async () => {
    const { deps, closing } = await runOnboarding("probe", { params: {} });
    expect(closing).toMatchObject({ status: "failed", result: { outcome: "error" } });
    for (const name of SPENDERS) expect(deps[name], name).not.toHaveBeenCalled();
  });

  it("önizlemesi yoktur: kuru koşu işi reddedilir, hiçbir şey çağrılmaz", async () => {
    const { deps, closing } = await runOnboarding("build", { dryRun: true });
    expect(closing?.status).toBe("failed");
    for (const name of SPENDERS) expect(deps[name], name).not.toHaveBeenCalled();
  });

  it("Apify anahtarı yoksa iş hata ile kapanır (bağlam kurulmaz)", async () => {
    const { deps, closing } = await runOnboarding("probe", {}, { deps: { missingEnv: () => ["APIFY_TOKEN"] } });
    expect(closing).toMatchObject({ status: "failed" });
    expect(String(closing?.error)).toContain("APIFY_TOKEN");
    expect(deps.createContext).not.toHaveBeenCalled();
  });

  it("süre tavanı aşamaya göredir: hesaba bakış kısa, ilk tur türün tavanı kadar", () => {
    const of = (phase: "probe" | "build") => onboardingTimeoutMinutes({ kind: "onboarding", params: { phase } });
    expect(of("probe")).toBe(ONBOARDING_PHASE_SPEC.probe.timeoutMinutes);
    expect(of("build")).toBe(JOB_KIND_SPEC.onboarding.timeoutMinutes);
    expect(onboardingTimeoutMinutes({ kind: "collect", params: {} })).toBeUndefined();
  });
});
