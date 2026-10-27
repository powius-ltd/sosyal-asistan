"use client";

import { Check, Circle, Loader2, Minus, X, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import type { JobsSeed } from "@/components/jobs/job-run-types";
import { useJobsStatus } from "@/components/jobs/use-jobs-status";
import { onboardingStepsOf, type OnboardingPhase } from "@/lib/domain/onboarding-job";
import type { JobStepId, JobStepStatus } from "@/lib/domain/panel-job";
import type { JobStatusView } from "@/lib/domain/panel-job-view";
import { JOB_OUTCOME_PLAIN, JOB_STEP_PLAIN } from "@/lib/plain-language";
import { ONBOARDING_PHASE_PLAIN, ONBOARDING_PROGRESS_PLAIN } from "@/lib/plain-language-onboarding";
import { cn } from "@/lib/utils";

/**
 * Adım geçişini (iş bitti → sonraki ekran) kaçırmamak için sayfa verisinin yenilenme aralığı. Asıl ilerleme durum ucundan gelir
 * (`/api/isler` yoklaması, ortak depo); bu yalnız emniyet ağıdır: sunucu adımı yeniden türetir, iş bittiyse ekran değişir.
 */
export const ONBOARDING_REFRESH_MS = 30_000;

const ICON: Record<JobStepStatus, { icon: LucideIcon; className: string }> = {
  pending: { icon: Circle, className: "border-border bg-card text-muted-foreground" },
  running: { icon: Loader2, className: "border-transparent bg-focus-surface text-focus-ink [&_svg]:animate-spin motion-reduce:[&_svg]:animate-none" },
  ok: { icon: Check, className: "border-transparent bg-brand-soft text-brand-soft-foreground" },
  skipped: { icon: Minus, className: "border-border bg-card text-muted-foreground" },
  failed: { icon: X, className: "border-destructive bg-card text-destructive" },
  needs_approval: { icon: Circle, className: "border-border bg-card text-muted-foreground" },
};

const capitalize = (text: string): string => text.charAt(0).toLocaleUpperCase("tr-TR") + text.slice(1);

interface ProgressPanelProps {
  /** Sunucunun çizdiği andaki iş durumu (durum şeridiyle AYNI tohum; müşteri görünümünde yönetici ayrıntısı taşımaz). */
  seed: JobsSeed;
  phase: OnboardingPhase;
}

/**
 * "Hesabına bakıyorum" / "ilk incelemeni yapıyorum": aşamanın bütün adımları sırayla, gerçek durumlarıyla (yapılan, şimdi yapılan,
 * sıradaki; inceleme adımında sayaç). Durum durum şeridiyle AYNI ortak depodan okunur (`useJobsStatus`: ayrı yoklama yok). Ekran okuyucu
 * duyurusu durum şeridinin canlı bölgesindedir (her panel sayfasında; adım değişince bir kez konuşur, sayaçta konuşmaz): burada ikinci
 * bir canlı bölge AÇILMAZ, yalnız "ilerleyemiyorum" notu duyurulur. İş bitince şerit sayfayı yeniler; ekran sunucuda türetilen yeni adıma
 * geçer. Etkin iş görünmüyorsa (bitti, ekran henüz yenilenmedi) "bitiriyorum" yazılır.
 */
export function ProgressPanel({ seed, phase }: ProgressPanelProps) {
  const router = useRouter();
  const { active } = useJobsStatus(seed);
  const view: JobStatusView | undefined = active?.kind === "onboarding" ? active : undefined;

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, ONBOARDING_REFRESH_MS);
    return () => clearInterval(timer);
  }, [router]);

  const written = new Map(view?.steps.map((step) => [step.id, step]));
  const steps = onboardingStepsOf(phase).map((id: JobStepId) => ({ id, status: written.get(id)?.status ?? ("pending" as const), code: written.get(id)?.code }));
  const stale = view?.stale === true;
  const note = view === undefined ? ONBOARDING_PROGRESS_PLAIN.finishing : stale ? ONBOARDING_PROGRESS_PLAIN.stale : view.status === "queued" ? ONBOARDING_PROGRESS_PLAIN.queued : undefined;

  return (
    <section
      aria-labelledby="onboarding-progress-heading"
      data-slot="onboarding-progress"
      data-phase={phase}
      data-state={view === undefined ? "settling" : stale ? "stale" : view.status}
      className="flex min-w-0 flex-col gap-5 rounded-[1.25rem] bg-ai-surface p-5 text-ai-surface-foreground lg:p-7"
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="text-sm font-semibold text-brand">{ONBOARDING_PHASE_PLAIN[phase]}</p>
        <h2 id="onboarding-progress-heading" className="font-figure text-xl leading-tight font-bold tracking-tight">
          {ONBOARDING_PROGRESS_PLAIN.stepsHeading}
        </h2>
      </div>

      {view?.status === "running" && !stale ? (
        <div className="h-1 w-full overflow-hidden rounded-pill bg-bar-track" aria-hidden>
          <div className="h-full w-1/3 animate-progress rounded-pill bg-brand motion-reduce:animate-none" />
        </div>
      ) : null}

      <ol className="flex min-w-0 flex-col" data-slot="onboarding-steps">
        {steps.map((step, index) => {
          const { icon: Icon, className } = ICON[step.status];
          const running = step.status === "running";
          const counting = running && view?.currentStep === step.id && view.progress !== undefined && view.progress.total > 0;
          return (
            <li
              key={step.id}
              data-step={step.id}
              data-step-status={step.status}
              aria-current={running ? "step" : undefined}
              className="relative flex min-w-0 gap-3.5 pb-4 last:pb-0"
            >
              {index < steps.length - 1 ? <span aria-hidden className={cn("absolute top-9 bottom-0 left-[1.0625rem] w-0.5 rounded-pill", step.status === "ok" ? "bg-brand-soft-foreground/40" : "bg-border")} /> : null}
              <span className={cn("relative grid size-9 shrink-0 place-items-center rounded-full border", className)}>
                <Icon className="size-4" aria-hidden />
              </span>
              <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 pt-1">
                <p className={cn("text-[1.0625rem] leading-snug break-words", running ? "font-semibold" : step.status === "pending" ? "text-muted-foreground" : "font-medium")}>
                  {capitalize(ONBOARDING_PROGRESS_PLAIN.stepDoing[phase][step.id] ?? JOB_STEP_PLAIN[step.id].doing)}
                  {counting && view.progress ? (
                    <span className="ml-2 font-figure font-bold tabular-nums text-brand" data-slot="step-counter">
                      {ONBOARDING_PROGRESS_PLAIN.counter(view.progress.done, view.progress.total)}
                    </span>
                  ) : null}
                </p>
                <p className="text-sm text-muted-foreground">
                  {ONBOARDING_PROGRESS_PLAIN.stepStatus[step.status]}
                  {step.code !== undefined ? ` · ${JOB_OUTCOME_PLAIN[step.code]}` : ""}
                </p>
              </div>
            </li>
          );
        })}
      </ol>

      {/* Canlı bölge hep DOM'da: yalnız "ilerleyemiyorum / sıradayım / bitiriyorum" notu duyurulur (adım duyurusu durum şeridindedir). */}
      <p role="status" data-slot="progress-note" className={note === undefined ? "sr-only" : cn("text-sm", stale ? "font-medium text-warning-strong" : "text-muted-foreground")}>
        {note ?? ""}
      </p>
    </section>
  );
}
