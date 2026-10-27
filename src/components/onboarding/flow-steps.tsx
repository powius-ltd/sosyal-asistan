import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { linkButtonClass } from "@/components/content/link-button";
import type { JobsSeed } from "@/components/jobs/job-run-types";
import { DecisionBlock, FigureRow, StepColumns } from "@/components/onboarding/decision-block";
import type { PlatformOption } from "@/components/onboarding/platform-options";
import { AddAccountForm } from "@/components/onboarding/add-account-form";
import { NotifyMe } from "@/components/onboarding/notify-me";
import { ReplaceAccountButton } from "@/components/onboarding/replace-account-button";
import { ProbeStartButton } from "@/components/onboarding/probe-start-button";
import { ProgressPanel } from "@/components/onboarding/progress-panel";
import { preselectedRivalIds, type RivalOption } from "@/components/onboarding/rival-options";
import { RivalsForm } from "@/components/onboarding/rivals-form";
import { QUIET_CARD } from "@/components/onboarding/surface";
import type { OnboardingState } from "@/lib/domain/onboarding";
import { ONBOARDING_RIVALS_MAX, type OnboardingPhase } from "@/lib/domain/onboarding-job";
import {
  ONBOARDING_ADD_SCREEN_PLAIN,
  ONBOARDING_BLOCKED_PLAIN,
  ONBOARDING_DONE_PLAIN,
  ONBOARDING_NOTIFY_PLAIN,
  ONBOARDING_PROGRESS_PLAIN,
  ONBOARDING_REVIEW_PLAIN,
  ONBOARDING_RIVALS_PLAIN,
  ONBOARDING_STEP_PLAIN,
  onboardingProfilePhrase,
} from "@/lib/plain-language-onboarding";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";

interface RivalsStepProps {
  state: Pick<OnboardingState, "account" | "probe">;
  options: readonly RivalOption[];
  /** YALNIZ yönetici modunda: harcama tavanı notu. */
  operatorNote?: string;
  closed?: ReactNode;
}

/** 4. ekran: benzer hesap seçimi + "Başlat". Yan sütun neden benzer hesaplara bakıldığını ve kimin için bakıldığını söyler. */
export function RivalsStep({ state, options, operatorNote, closed }: RivalsStepProps) {
  const handle = state.probe?.profile.handle ?? state.account?.handle;
  return (
    <StepColumns>
      {closed ?? (
        <DecisionBlock current={4} label={ONBOARDING_STEP_PLAIN.choose_rivals.title}>
          <RivalsForm options={options} preselected={preselectedRivalIds(options)} max={ONBOARDING_RIVALS_MAX} operatorNote={operatorNote} />
        </DecisionBlock>
      )}
      <aside className="flex min-w-0 flex-col gap-3">
        <section className={QUIET_CARD} aria-labelledby="onboarding-why-heading">
          <h2 id="onboarding-why-heading" className="font-figure text-[1.1875rem] leading-tight font-semibold tracking-tight">
            {ONBOARDING_RIVALS_PLAIN.whyHeading}
          </h2>
          <p className="font-voice text-[1.0625rem] leading-[1.5] text-muted-foreground">{ONBOARDING_RIVALS_PLAIN.why}</p>
        </section>
        {handle !== undefined ? (
          <p className="px-1 text-sm text-muted-foreground" data-slot="own-account">
            {onboardingProfilePhrase({ handle, followers: state.probe?.profile.followers ?? state.account?.followers, videoCount: state.probe?.videoCount })}
          </p>
        ) : null}
      </aside>
    </StepColumns>
  );
}

/** 2. ve 5. ekran: iş sürerken. Solda adımlar (canlı), sağda ne kadar süreceği ve "kapatabilirsin". İş durumu okunamadıysa yalnız not. */
export function ProgressStep({ phase, seed }: { phase: OnboardingPhase; seed: JobsSeed | undefined }) {
  const duration = ONBOARDING_PROGRESS_PLAIN.duration[phase];
  return (
    <StepColumns>
      {seed !== undefined ? (
        <ProgressPanel seed={seed} phase={phase} />
      ) : (
        <section className="rounded-[1.25rem] bg-ai-surface p-5 text-ai-surface-foreground lg:p-7" data-slot="onboarding-progress" data-state="unknown">
          <p className="text-base">{ONBOARDING_PROGRESS_PLAIN.finishing}</p>
        </section>
      )}
      <aside className="flex min-w-0 flex-col gap-3" aria-labelledby="onboarding-duration-heading">
        <h2 id="onboarding-duration-heading" className="font-figure text-[1.1875rem] leading-tight font-semibold tracking-tight">
          {ONBOARDING_PROGRESS_PLAIN.durationHeading}
        </h2>
        <ul className="flex min-w-0 flex-col gap-2.5">
          <FigureRow figure={duration.figure} unit={duration.unit} text={ONBOARDING_STEP_PLAIN[phase === "probe" ? "probing" : "building"].title} tone="brand" />
        </ul>
        <section className={QUIET_CARD} aria-labelledby="onboarding-closable-heading" data-slot="onboarding-closable">
          <h2 id="onboarding-closable-heading" className="font-figure text-[1.1875rem] leading-tight font-semibold tracking-tight">
            {ONBOARDING_NOTIFY_PLAIN.closableHeading}
          </h2>
          <p className="font-voice text-[1.0625rem] leading-[1.5] text-muted-foreground">{ONBOARDING_NOTIFY_PLAIN.closableBody[phase]}</p>
          <NotifyMe />
        </section>
      </aside>
    </StepColumns>
  );
}

interface BlockedStepProps {
  state: Pick<OnboardingState, "next" | "reason" | "account" | "attemptsLeft">;
  platforms: readonly PlatformOption[];
  /** "Kaldığın yerden sürdür" düğmesi (sunucu sarmalayıcı `JobAction`; işler kapalıysa yedeği). Sayfa verir. */
  resume: ReactNode;
  closed?: ReactNode;
}

/**
 * Akış durdu: neden sayfa başlığında yazar (`onboardingHeadingOf`), burada yinelenmez; burada çıkış yolu vardır. Yeniden bakış (`start_probe`: gizli hesap açıldı, video paylaşıldı, geçici
 * hata) → "Hesabıma bak"; başka hesap (`add_account`: bulunamadı, deneme hakkı bitti) → hesap ekleme formu; yarıda kalan ilk inceleme
 * (`resume`) → kalan iş onaysız haftalık turla sürer. İlk incelemesi hiç başlayamayan akış bu ekrana gelmez (seçim ekranına döner).
 */
export function BlockedStep({ state, platforms, resume, closed }: BlockedStepProps) {
  const handle = state.account?.handle;
  if (closed !== undefined) return <StepColumns>{closed}</StepColumns>;
  if (state.next === "resume") {
    return (
      <StepColumns>
        <section className="flex min-w-0 flex-col gap-4 rounded-[1.25rem] bg-ai-surface p-5 text-ai-surface-foreground lg:p-7" data-slot="onboarding-resume">
          <p className="font-voice text-[1.0625rem] leading-[1.5]">{ONBOARDING_BLOCKED_PLAIN.resumeNote}</p>
          <div className="flex min-w-0 flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-start">
            {resume}
            <Link href={ROUTES.results} className={cn(linkButtonClass("outline", "touch"), "h-12 w-full sm:w-auto")}>
              {ONBOARDING_DONE_PLAIN.openResults}
              <ArrowRight aria-hidden />
            </Link>
          </div>
        </section>
      </StepColumns>
    );
  }
  if (state.next === "start_probe") {
    return (
      <StepColumns>
        <DecisionBlock current={2} label={ONBOARDING_STEP_PLAIN.blocked.title}>
          <div className="flex min-w-0 flex-col gap-1.5">
            {handle !== undefined ? <p className="text-[1.5rem] leading-tight font-bold tracking-tight break-all">@{handle}</p> : null}
            <p className="text-base text-focus-ink-muted">
              {ONBOARDING_BLOCKED_PLAIN.retryNote} {state.attemptsLeft.probe > 0 ? ONBOARDING_BLOCKED_PLAIN.attempts(state.attemptsLeft.probe) : ""}
            </p>
          </div>
          <div className="flex min-w-0 flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-start">
            <ProbeStartButton />
            <ReplaceAccountButton label={ONBOARDING_ADD_SCREEN_PLAIN.another} failure={ONBOARDING_REVIEW_PLAIN.notMeFailed} />
          </div>
        </DecisionBlock>
      </StepColumns>
    );
  }
  return (
    <StepColumns>
      <DecisionBlock current={1} label={ONBOARDING_ADD_SCREEN_PLAIN.another}>
        <h2 className="font-figure text-xl leading-tight font-bold tracking-tight">{ONBOARDING_ADD_SCREEN_PLAIN.another}</h2>
        <AddAccountForm platforms={platforms} />
      </DecisionBlock>
    </StepColumns>
  );
}
