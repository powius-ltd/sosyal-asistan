import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { linkButtonClass } from "@/components/content/link-button";
import { ONBOARDING_ADD_HREF } from "@/components/onboarding/add-intent";
import { captionPreview } from "@/components/outliers/caption";
import { Demirkazik } from "@/components/mascot/demirkazik";
import type { ContentItem } from "@/lib/domain/content";
import type { OnboardingState } from "@/lib/domain/onboarding";
import type { WeeklyPlanSummary } from "@/lib/domain/weekly-plan";
import { formatNumber } from "@/lib/format";
import { liftPhrase } from "@/lib/plain-language";
import { ONBOARDING_ADD_SCREEN_PLAIN, ONBOARDING_DONE_PLAIN } from "@/lib/plain-language-onboarding";
import { ROUTES, thisWeekFor } from "@/lib/routes";
import { cn } from "@/lib/utils";

const OUTLIER_TITLE_MAX = 90;

interface DoneStepProps {
  state: Pick<OnboardingState, "reason">;
  /** En güncel plan; `null` = plan yok, `undefined` = okunamadı. */
  plan: WeeklyPlanSummary | null | undefined;
  /** En çok tutan videolar (en çok üç); okunamadıysa undefined. */
  outliers: readonly ContentItem[] | undefined;
  maskotName: string;
  /** Yeni hesap eklenebiliyor mu (kapı açık): "Başka bir hesap ekle" bağlantısı çizilir. */
  canAdd: boolean;
}

/**
 * 6. ekran: akış kapandı. Plan hazırsa sade bir kutlama (Demirkazık anlatıyor, planın rakamı, "Planı aç") + en çok tutan üç video +
 * Sonuçlar. Plan çıkmadıysa (`plan_not_ready`) dürüst cümle ve Sonuçlar bağlantısı: uydurma plan özeti çizilmez. Akıştan önce kurulmuş
 * hesapta (`legacy`) yalnız Bugün'e dönüş vardır. Ölçülemeyen değer cümleye girmez (0 uydurulmaz).
 */
export function DoneStep({ state, plan, outliers, maskotName, canAdd }: DoneStepProps) {
  const ready = state.reason === "plan_ready";
  const legacy = state.reason === "legacy";
  return (
    <div className="flex min-w-0 flex-col gap-6 lg:gap-8">
      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:items-start lg:gap-8">
        {ready ? (
          <PlanBlock plan={plan} maskotName={maskotName} />
        ) : (
          <section data-slot="onboarding-done" data-ready="false" className="flex min-w-0 flex-col gap-4 rounded-[1.25rem] border border-awaiting-border bg-card p-5 lg:p-7">
            <div className="flex min-w-0 items-center gap-2 text-[0.9375rem] font-semibold text-brand">
              <Demirkazik state="waiting" className="size-7" />
              <span>{maskotName}</span>
            </div>
            <p className="font-voice text-xl leading-snug text-pretty">
              {state.reason === "plan_not_ready" ? ONBOARDING_DONE_PLAIN.notReadyNext : ONBOARDING_DONE_PLAIN.legacyLead}
            </p>
            <div className="flex min-w-0 flex-col gap-2.5 sm:flex-row sm:flex-wrap">
              <Link href={legacy ? ROUTES.overview : ROUTES.results} className={cn(linkButtonClass("default", "touch"), "h-12 w-full px-5 text-[0.9375rem] font-semibold sm:w-auto")}>
                {legacy ? ONBOARDING_DONE_PLAIN.openToday : ONBOARDING_DONE_PLAIN.openResults}
                <ArrowRight aria-hidden />
              </Link>
              {legacy ? null : (
                <Link href={ROUTES.overview} className={cn(linkButtonClass("outline", "touch"), "h-12 w-full sm:w-auto")}>
                  {ONBOARDING_DONE_PLAIN.openToday}
                </Link>
              )}
            </div>
          </section>
        )}
        {legacy ? null : <OutlierList outliers={outliers} />}
      </div>
      {canAdd ? (
        <Link href={ONBOARDING_ADD_HREF} className="inline-flex min-h-tap w-fit items-center gap-1.5 text-[0.9375rem] font-semibold text-brand underline-offset-4 hover:underline">
          {ONBOARDING_ADD_SCREEN_PLAIN.another}
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      ) : null}
    </div>
  );
}

function PlanBlock({ plan, maskotName }: { plan: WeeklyPlanSummary | null | undefined; maskotName: string }) {
  const count = plan ? formatNumber(plan.plannedCount) : undefined;
  return (
    <section
      aria-labelledby="onboarding-plan-heading"
      data-slot="onboarding-done"
      data-ready="true"
      className="flex min-w-0 animate-arrive flex-col gap-5 rounded-[1.25rem] bg-brand-soft p-5 text-brand-soft-foreground motion-reduce:animate-none lg:p-7"
    >
      <div className="flex min-w-0 items-center gap-2 text-[0.9375rem] font-semibold">
        <Demirkazik state="telling" className="size-8" />
        <span>{maskotName}</span>
        <span className="font-normal">· {ONBOARDING_DONE_PLAIN.planHeading}</span>
      </div>
      <h2 id="onboarding-plan-heading" className="sr-only">
        {ONBOARDING_DONE_PLAIN.planHeading}
      </h2>
      {count !== undefined && plan && plan.plannedCount > 0 ? (
        <div className="flex min-w-0 flex-wrap items-end gap-x-4 gap-y-1" data-slot="plan-figure">
          <p className="font-figure text-[5.25rem]/[0.88] font-bold tracking-[-0.05em] tabular-nums text-brand lg:text-[6.5rem]/[0.88]">{count}</p>
          <p className="max-w-[14ch] pb-1 text-lg leading-snug font-semibold text-foreground">{ONBOARDING_DONE_PLAIN.planCount}</p>
        </div>
      ) : (
        <p className="font-figure text-2xl leading-tight font-bold tracking-tight text-foreground">{ONBOARDING_DONE_PLAIN.planUnknown}</p>
      )}
      {plan?.summary !== undefined && plan.summary.trim() !== "" ? <p className="max-w-[60ch] font-voice text-[1.0625rem] leading-[1.5] text-foreground">{plan.summary}</p> : null}
      <div className="flex min-w-0 flex-col gap-2.5 sm:flex-row sm:flex-wrap">
        <Link href={thisWeekFor(plan?.weekStart)} className={cn(linkButtonClass("default", "touch"), "h-[3.375rem] w-full rounded-control px-6 text-base font-semibold sm:w-auto")}>
          {ONBOARDING_DONE_PLAIN.openPlan}
          <ArrowRight aria-hidden />
        </Link>
        <Link href={ROUTES.overview} className={cn(linkButtonClass("outline", "touch"), "h-[3.375rem] w-full rounded-control px-5 text-base sm:w-auto")}>
          {ONBOARDING_DONE_PLAIN.openToday}
        </Link>
      </div>
    </section>
  );
}

function OutlierList({ outliers }: { outliers: readonly ContentItem[] | undefined }) {
  if (outliers === undefined) return null;
  return (
    <section aria-labelledby="onboarding-outliers-heading" data-slot="onboarding-outliers" className="flex min-w-0 flex-col gap-2.5">
      <h2 id="onboarding-outliers-heading" className="font-figure text-[1.1875rem] leading-tight font-semibold tracking-tight">
        {ONBOARDING_DONE_PLAIN.outliersHeading}
      </h2>
      {outliers.length === 0 ? (
        <p className="rounded-card bg-card p-4 text-[0.9375rem] text-muted-foreground">{ONBOARDING_DONE_PLAIN.outliersEmpty}</p>
      ) : (
        <ul className="flex min-w-0 flex-col gap-2.5">
          {outliers.map((item) => {
            const phrase = liftPhrase(item.score.lift);
            return (
              <li key={item.id} className="min-w-0">
                <Link
                  href={ROUTES.video(item.id)}
                  className="flex min-h-tap min-w-0 flex-col gap-1 rounded-card bg-card p-4 outline-none transition-colors duration-fast hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none"
                >
                  <span className="text-base leading-snug font-medium break-words">{captionPreview(item.caption, OUTLIER_TITLE_MAX) ?? ONBOARDING_DONE_PLAIN.untitled}</span>
                  <span className="text-sm text-muted-foreground">
                    @{item.owner.handle}
                    {phrase !== undefined ? <span className="font-semibold text-brand"> · {phrase}</span> : null}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <Link href={ROUTES.results} className="inline-flex min-h-tap w-fit items-center gap-1.5 text-[0.9375rem] font-semibold text-brand underline-offset-4 hover:underline">
        {ONBOARDING_DONE_PLAIN.openResults}
        <ArrowRight className="size-4" aria-hidden />
      </Link>
    </section>
  );
}
