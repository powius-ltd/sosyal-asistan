import { Check, Circle, Hand, Loader2, Minus, X, type LucideIcon } from "lucide-react";

import { isActiveJobStatus, JOB_STEPS_BY_KIND, type JobStep, type JobStepStatus } from "@/lib/domain/panel-job";
import type { JobStatusView, JobStepView } from "@/lib/domain/panel-job-view";
import { formatElapsed, formatNumber, formatUsd } from "@/lib/format";
import { JOB_OUTCOME_PLAIN, JOB_STEP_PLAIN, JOB_STEP_STATUS_PLAIN } from "@/lib/plain-language";
import { cn } from "@/lib/utils";

const ICON: Record<JobStepStatus, { icon: LucideIcon; className: string }> = {
  pending: { icon: Circle, className: "text-muted-foreground" },
  running: { icon: Loader2, className: "animate-spin text-foreground motion-reduce:animate-none" },
  ok: { icon: Check, className: "text-success" },
  skipped: { icon: Minus, className: "text-muted-foreground" },
  failed: { icon: X, className: "text-destructive" },
  needs_approval: { icon: Hand, className: "text-warning-strong" },
};

/**
 * Gösterilecek adımlar: işçinin yazdıkları; iş henüz alınmadıysa (adım yok) ve hâlâ etkinse türün adımları "sırada" olarak. Bitmiş ve
 * adımı olmayan işte (sıradayken durdurulan) uydurma adım gösterilmez.
 */
export function stepsToShow(view: Pick<JobStatusView, "kind" | "status" | "steps">): JobStepView[] {
  if (view.steps.length > 0) return view.steps;
  return isActiveJobStatus(view.status) ? JOB_STEPS_BY_KIND[view.kind].map((id) => ({ id, status: "pending" as const })) : [];
}

/** Yönetici ayrıntısı: süre · tahmin · harcanan (bilinmeyen parça yazılmaz; koşmayan adımın 0 saniyesi yazılmaz). */
function operatorMeta(step: JobStep): string | undefined {
  const parts = [
    step.seconds !== undefined && step.seconds > 0 ? formatElapsed(step.seconds) : undefined,
    step.spend?.estimateUsd === undefined ? undefined : `tahmin ${formatUsd(step.spend.estimateUsd)}`,
    step.spend?.actualUsd === undefined ? undefined : `harcanan ${formatUsd(step.spend.actualUsd)}`,
  ].filter((part): part is string => part !== undefined);
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

/**
 * İşin adım listesi (çalışan iş ve geçmiş ortak): ad + durum + bilinen sonucun cümlesi; hepsi sözlükten (`lib/plain-language.ts`).
 * Her adım GERÇEK durumuyla çizilir: atlanan, onay bekleyen ve olmayan adım "tamam" görünmez. Yönetici modunda (`view.operator`
 * doluysa) işçinin ham notu, süre ve tutar da yazılır; müşteri görünümünde bu alanlar hiç gelmez. `outcomeShown`: işin sonuç cümlesi
 * hemen üstte zaten yazılıysa (geçmiş satırı) aynı cümle adımda yinelenmez.
 */
export function JobStepList({ view, outcomeShown = false, className }: { view: JobStatusView; outcomeShown?: boolean; className?: string }) {
  const steps = stepsToShow(view);
  if (steps.length === 0) return null;
  const raw = new Map(view.operator?.steps.map((step) => [step.id, step]));
  return (
    <ol data-slot="job-steps" className={cn("flex flex-col gap-2 text-sm", className)}>
      {steps.map((step) => {
        const { icon: Icon, className: iconClass } = ICON[step.status];
        const counting = step.id === view.currentStep && step.status === "running" && view.progress !== undefined && view.progress.total > 0;
        const detail = raw.get(step.id);
        const meta = detail === undefined ? undefined : operatorMeta(detail);
        return (
          <li key={step.id} data-step={step.id} data-step-status={step.status} className="flex min-w-0 gap-2">
            <Icon className={cn("mt-0.5 size-4 shrink-0", iconClass)} aria-hidden />
            <div className="flex min-w-0 flex-col gap-0.5">
              <p>
                <span className="font-medium">{JOB_STEP_PLAIN[step.id].name}</span>
                <span className="text-muted-foreground">
                  {" · "}
                  {JOB_STEP_STATUS_PLAIN[step.status]}
                  {counting && view.progress ? <span className="tabular"> ({formatNumber(view.progress.done)}/{formatNumber(view.progress.total)})</span> : null}
                </span>
              </p>
              {step.code !== undefined && !(outcomeShown && step.code === view.outcome) ? <p className="text-muted-foreground">{JOB_OUTCOME_PLAIN[step.code]}</p> : null}
              {detail?.note ? (
                <p data-operator="note" className="text-xs break-words text-muted-foreground">
                  {detail.note}
                </p>
              ) : null}
              {meta !== undefined ? (
                <p data-operator="meta" className="text-xs text-muted-foreground tabular">
                  {meta}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
