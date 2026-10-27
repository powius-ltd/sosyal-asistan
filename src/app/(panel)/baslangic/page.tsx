import type { Metadata } from "next";
import type { ReactNode } from "react";

import { JobAction } from "@/components/jobs/job-action";
import { loadJobsState } from "@/components/jobs/jobs-state";
import { AddStep, ReviewStep } from "@/components/onboarding/account-steps";
import { ONBOARDING_ADD_PARAM } from "@/components/onboarding/add-intent";
import { DoneStep } from "@/components/onboarding/done-step";
import { BlockedStep, ProgressStep, RivalsStep } from "@/components/onboarding/flow-steps";
import { onboardingHeadingOf, onboardingMascotState, onboardingPhaseOfScreen, onboardingRoutePosition, onboardingScreenOf } from "@/components/onboarding/flow-view";
import { loadOnboardingState } from "@/components/onboarding/onboarding-data";
import { OnboardingFrame } from "@/components/onboarding/onboarding-frame";
import { onboardingPlatformOptions } from "@/components/onboarding/platform-options";
import { buildRivalOptions } from "@/components/onboarding/rival-options";
import { maskotName } from "@/lib/agents/persona";
import { getPanelContext } from "@/lib/data";
import { ONBOARDING_PHASE_SPEC } from "@/lib/domain/onboarding-job";
import { formatUsd } from "@/lib/format";
import { ONBOARDING_GATE_MESSAGE, onboardingGate } from "@/lib/onboarding/gate";
import { readSafe } from "@/lib/overview/read-safe";
import { ONBOARDING_ACTION_PLAIN, ONBOARDING_BLOCKED_PLAIN } from "@/lib/plain-language-onboarding";
import { first, type RawSearchParams } from "@/lib/search-params";
import { isOperatorMode } from "@/lib/workspace/operator-mode";

export const metadata: Metadata = { title: "Başlangıç" };

/** Ekranda gösterilen tutan video sayısı ("ilk planın hazır"). */
const DONE_OUTLIER_COUNT = 3;

/** Akışın eylemleri bu ortamda kapalıyken formların yerine çizilen not (kapının nedeni; düz dil). */
function ClosedNotice({ message }: { message: string }) {
  return (
    <section data-slot="onboarding-closed" className="flex min-w-0 flex-col gap-1.5 rounded-card border border-awaiting-border bg-card p-5">
      <h2 className="font-figure text-lg font-semibold tracking-tight">{ONBOARDING_BLOCKED_PLAIN.closedHeading}</h2>
      <p className="text-[0.9375rem] text-muted-foreground">{message}</p>
    </section>
  );
}

/**
 * Başlangıç akışı: hesap ekle → hesaba bakış → "bu sen misin?" → benzer hesaplar → ilk inceleme → ilk plan. TEK rota; adım SAKLANMAZ ve
 * URL'de taşınmaz: `repo.getOnboardingState` her istekte iş satırlarından ve veriden türetir (sayfayı kapatıp gelen kaldığı ekrana düşer).
 * `?ekle=1` yalnız "başka hesap ekle" niyetidir (hesap seçicideki "Hesap ekle"). Ekranlar `components/onboarding/**`, eylemler
 * `app/actions/onboarding.ts`; ilerleme durum ucundan (`components/jobs` ortak deposu). Eylemler kapının (`onboardingGate`) açık olduğu
 * ortamda çizilir; kapalıyken nedeni yazılır (ilerleme ve sonuç ekranları herkese açıktır). Tutar yalnız yönetici modunda, küçük not olarak.
 */
export default async function OnboardingPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const [params, { repo, wsId }, state] = await Promise.all([searchParams, getPanelContext(), loadOnboardingState()]);
  const gate = onboardingGate();
  const closed: ReactNode | undefined = gate.open ? undefined : <ClosedNotice message={ONBOARDING_GATE_MESSAGE[gate.reason]} />;
  const wantsAdd = first(params[ONBOARDING_ADD_PARAM]) !== undefined;
  const screen = onboardingScreenOf(state, wantsAdd);
  const heading = onboardingHeadingOf(screen, state);
  const position = onboardingRoutePosition(screen, state);
  const name = maskotName();

  let body: ReactNode;
  switch (screen) {
    case "add":
      body = <AddStep state={state} platforms={onboardingPlatformOptions()} closed={closed} returning={wantsAdd && state.step !== "add_account"} />;
      break;
    case "probing":
    case "building": {
      const jobs = await readSafe("iş durumu", loadJobsState);
      body = <ProgressStep phase={onboardingPhaseOfScreen(screen)} seed={jobs?.seed} />;
      break;
    }
    case "review":
      body = <ReviewStep state={state} closed={closed} />;
      break;
    case "rivals": {
      const platform = state.account?.platform;
      const [discovered, candidates] = await Promise.all([
        readSafe("benzer hesap önerileri", () => repo.listDiscoveryCandidates(wsId, { ...(platform === undefined ? {} : { platform }) })),
        readSafe("eklenen hesaplar", () => repo.listCompetitors(wsId, { status: "candidate", ...(platform === undefined ? {} : { platform }) })),
      ]);
      const cap = formatUsd(ONBOARDING_PHASE_SPEC.build.maxUsd);
      body = (
        <RivalsStep
          state={state}
          options={buildRivalOptions(discovered ?? [], candidates ?? [])}
          operatorNote={isOperatorMode() && cap !== undefined ? `Yönetici notu: bu adımın harcama tavanı ${cap}; hesap başına bir kez.` : undefined}
          closed={closed}
        />
      );
      break;
    }
    case "blocked":
      body = (
        <BlockedStep
          state={state}
          platforms={onboardingPlatformOptions()}
          closed={closed}
          resume={<JobAction request={{ kind: "routine" }} label={ONBOARDING_ACTION_PLAIN.resume} variant="default" size="touch" quietWhenBlocked />}
        />
      );
      break;
    case "done": {
      const [plans, outliers] = await Promise.all([
        readSafe("plan özeti", () => repo.listWeeklyPlans(wsId, { limit: 1 })),
        state.reason === "legacy" ? undefined : readSafe("tutan videolar", () => repo.listOutliers(wsId, { limit: DONE_OUTLIER_COUNT })),
      ]);
      body = <DoneStep state={state} plan={plans === undefined ? undefined : (plans[0] ?? null)} outliers={outliers?.items.slice(0, DONE_OUTLIER_COUNT)} maskotName={name} canAdd={gate.open} />;
      break;
    }
  }

  return (
    <div data-slot="onboarding" data-step={state.step} data-screen={screen}>
      <OnboardingFrame title={heading.title} lead={heading.lead} notice={heading.notice} maskotName={name} mascot={onboardingMascotState(screen)} current={position.current} complete={position.complete}>
        {body}
      </OnboardingFrame>
    </div>
  );
}
