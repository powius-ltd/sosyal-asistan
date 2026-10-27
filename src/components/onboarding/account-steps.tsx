import { ArrowLeft, BadgeCheck, ChevronRight, ShieldCheck } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { MeasuredValue } from "@/components/common/measured-value";
import { PlatformBadge } from "@/components/common/platform-badge";
import { AddAccountForm } from "@/components/onboarding/add-account-form";
import { DecisionBlock, FigureRow, StepColumns } from "@/components/onboarding/decision-block";
import type { PlatformOption } from "@/components/onboarding/platform-options";
import { FOCUS_RING } from "@/components/onboarding/surface";
import { ProbeStartButton } from "@/components/onboarding/probe-start-button";
import { ReviewAccountForm, type AccountTypeChoice } from "@/components/onboarding/review-account-form";
import { ACCOUNT_TYPES, accountTypeProfile } from "@/lib/domain/account-type";
import type { OnboardingState } from "@/lib/domain/onboarding";
import type { OnboardingProbeResult } from "@/lib/domain/onboarding-job";
import { formatCompact } from "@/lib/format";
import { ONBOARDING_ADD_SCREEN_PLAIN, ONBOARDING_REVIEW_PLAIN, ONBOARDING_STEP_PLAIN } from "@/lib/plain-language-onboarding";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";

interface AddStepProps {
  state: Pick<OnboardingState, "step" | "next" | "account">;
  platforms: readonly PlatformOption[];
  /** Akışın eylemleri bu ortamda açık mı (`onboardingGate`); kapalıysa form yerine `closed` çizilir. */
  closed?: ReactNode;
  /** Kurulu / akışı süren hesaptayken "başka hesap ekle" niyetiyle gelindi: geri dönüş bağlantısı çizilir. */
  returning: boolean;
}

/**
 * 1. ekran: hesap ekle. Hesap ekli ama ona hiç bakılmadıysa (`start_probe`) tek karar vardır: "Hesabıma bak" (tek birincil düğme, "Sıra
 * sende" yalnız bu blokta). "Başka bir hesap ekle" aynı bloğun altında KAPALI bir açılır alandır; açılınca form çerçeveli ikincil düğme
 * taşır. Yan sütun sonra ne olacağını üç cümleli rakamla söyler.
 */
export function AddStep({ state, platforms, closed, returning }: AddStepProps) {
  const pendingAccount = !returning && state.step === "add_account" && state.next === "start_probe" ? state.account : undefined;
  return (
    <StepColumns>
      <div className="flex min-w-0 flex-col gap-4">
        {returning && state.account !== undefined ? (
          <Link href={ROUTES.onboarding} className="inline-flex min-h-tap w-fit items-center gap-1.5 text-[0.9375rem] font-semibold text-brand underline-offset-4 hover:underline">
            <ArrowLeft className="size-4" aria-hidden />
            {ONBOARDING_ADD_SCREEN_PLAIN.back(state.account.handle)}
          </Link>
        ) : null}
        {closed ?? (
          <>
            {pendingAccount !== undefined ? (
              <DecisionBlock current={1} label={ONBOARDING_ADD_SCREEN_PLAIN.existing(pendingAccount.handle)}>
                <div data-slot="pending-account" className="flex min-w-0 flex-col gap-4">
                  <p className="font-figure text-xl leading-tight font-bold tracking-tight break-words">{ONBOARDING_ADD_SCREEN_PLAIN.existing(pendingAccount.handle)}</p>
                  <ProbeStartButton />
                </div>
                <details data-slot="another-account" className="group border-t border-focus-line pt-2">
                  <summary
                    className={cn(
                      "flex min-h-tap cursor-pointer list-none items-center gap-2 rounded-control text-[0.9375rem] font-semibold underline-offset-4 hover:underline [&::-webkit-details-marker]:hidden",
                      FOCUS_RING,
                    )}
                  >
                    <ChevronRight className="size-4 shrink-0 transition-transform duration-fast group-open:rotate-90 motion-reduce:transition-none" aria-hidden />
                    {ONBOARDING_ADD_SCREEN_PLAIN.another}
                  </summary>
                  <div className="pt-4">
                    <AddAccountForm platforms={platforms} quiet />
                  </div>
                </details>
              </DecisionBlock>
            ) : (
              <DecisionBlock current={1} label={ONBOARDING_STEP_PLAIN.add_account.title}>
                <AddAccountForm platforms={platforms} />
              </DecisionBlock>
            )}
          </>
        )}
      </div>
      <aside className="flex min-w-0 flex-col gap-3" aria-labelledby="onboarding-next-heading">
        <h2 id="onboarding-next-heading" className="font-figure text-[1.1875rem] leading-tight font-semibold tracking-tight">
          {ONBOARDING_ADD_SCREEN_PLAIN.nextHeading}
        </h2>
        <ol className="flex min-w-0 flex-col gap-2.5">
          {ONBOARDING_ADD_SCREEN_PLAIN.next.map((row, index) => (
            <FigureRow key={row.text} figure={row.figure} unit={row.unit} text={row.text} detail={row.detail} tone={index === 0 ? "brand" : "card"} />
          ))}
        </ol>
        <p className="flex min-w-0 items-start gap-2 px-1 text-sm text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
          {ONBOARDING_ADD_SCREEN_PLAIN.promise}
        </p>
      </aside>
    </StepColumns>
  );
}

/** Hesap türü seçenekleri (etiket ve açıklama tek tablodan: `domain/account-type.ts`). */
const TYPE_CHOICES: AccountTypeChoice[] = ACCOUNT_TYPES.map((value) => {
  const profile = accountTypeProfile(value);
  return { value, label: profile.label, description: profile.description };
});

interface ReviewStepProps {
  state: Pick<OnboardingState, "account" | "accountType" | "nicheBrief" | "probe">;
  closed?: ReactNode;
}

/**
 * 3. ekran: "bu sen misin?". Solda bulunan hesabın özeti (ölçülemeyen sayı tire + sebep; 0 uydurulmaz), sağda karar (tür + konu + onay).
 * Bakışın çıktısı yoksa (beklenmez) özet eldeki hesap kaydından kurulur.
 */
export function ReviewStep({ state, closed }: ReviewStepProps) {
  const profile = state.probe?.profile;
  const handle = profile?.handle ?? state.account?.handle;
  return (
    <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] lg:items-start lg:gap-8">
      {handle !== undefined ? <ProfileCard handle={handle} account={state.account} probe={state.probe} /> : null}
      {closed ?? (
        <DecisionBlock current={3} label={ONBOARDING_STEP_PLAIN.review_account.title}>
          <ReviewAccountForm
            types={TYPE_CHOICES}
            initialType={state.probe?.suggestedAccountType ?? state.accountType}
            suggestedType={state.probe?.suggestedAccountType}
            initialNiche={state.nicheBrief ?? state.probe?.nicheDraft ?? ""}
          />
        </DecisionBlock>
      )}
    </div>
  );
}

function ProfileCard({ handle, account, probe }: { handle: string; account: OnboardingState["account"]; probe: OnboardingProbeResult | undefined }) {
  const profile = probe?.profile;
  const platform = profile?.platform ?? account?.platform;
  const displayName = profile?.displayName ?? account?.displayName;
  const followers = profile?.followers ?? account?.followers;
  return (
    <section aria-labelledby="onboarding-profile-heading" data-slot="onboarding-profile" className="flex min-w-0 flex-col gap-4 rounded-card bg-card p-5 lg:p-6">
      <div className="flex min-w-0 flex-col gap-1.5">
        <p id="onboarding-profile-heading" className="text-sm font-semibold text-brand">
          {ONBOARDING_REVIEW_PLAIN.profileHeading}
        </p>
        <p className="text-[1.625rem] leading-[1.1] font-bold tracking-tight break-all">@{handle}</p>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {displayName !== undefined ? <span className="min-w-0 text-base font-medium break-words">{displayName}</span> : null}
          {platform !== undefined ? <PlatformBadge platform={platform} /> : null}
          {profile?.isVerified === true ? (
            <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
              <BadgeCheck className="size-4 text-brand" aria-hidden />
              {ONBOARDING_REVIEW_PLAIN.verified}
            </span>
          ) : null}
        </div>
      </div>
      <dl className="grid min-w-0 grid-cols-2 gap-2.5">
        <ProfileFigure label={ONBOARDING_REVIEW_PLAIN.followers} value={followers} reason={ONBOARDING_REVIEW_PLAIN.followersUnknown} tone="brand" />
        <ProfileFigure label={ONBOARDING_REVIEW_PLAIN.videos} value={probe?.videoCount} reason={ONBOARDING_REVIEW_PLAIN.videosUnknown} />
      </dl>
      {profile?.bio !== undefined && profile.bio.trim() !== "" ? <p className="font-voice text-base leading-relaxed break-words text-muted-foreground">{profile.bio}</p> : null}
    </section>
  );
}

function ProfileFigure({ label, value, reason, tone }: { label: string; value: number | undefined; reason: string; tone?: "brand" }) {
  return (
    <div className={tone === "brand" ? "flex min-w-0 flex-col-reverse gap-1 rounded-inner bg-brand-soft p-3.5" : "flex min-w-0 flex-col-reverse gap-1 rounded-inner bg-surface p-3.5"}>
      <dt className="text-sm font-semibold text-muted-foreground">{label}</dt>
      <dd className="font-figure text-[2.25rem] leading-none font-bold tracking-[-0.04em]">
        <MeasuredValue value={value} reason={reason} inline format={(n) => formatCompact(n) ?? String(n)} />
      </dd>
    </div>
  );
}
