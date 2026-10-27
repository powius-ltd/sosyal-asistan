import { Check } from "lucide-react";

import { WeeklyFlowActionButton } from "@/components/weekly-flow/weekly-flow-actions";
import { WEEKLY_FLOW_COPY as COPY } from "@/lib/copy/weekly-flow";
import { cn } from "@/lib/utils";
import type { WeeklyFlowAction, WeeklyFlowState, WeeklyFlowStep } from "@/lib/weekly-flow/types";

/** Kutu görünümü: etkin = sıra sende (sarı ailesi), biten = başarı, bekleyen sönük, okunamayan = uyarı. */
const BOX: Record<WeeklyFlowState, string> = {
  active: "border-attention-soft-edge bg-attention-soft text-attention-soft-ink",
  done: "border-border bg-card text-card-foreground",
  waiting: "border-border bg-muted/50 text-muted-foreground",
  blocked: "border-border bg-warning-soft text-warning-soft-foreground",
};

const labelOf = (action: WeeklyFlowAction) => (action.kind === "chat" ? COPY.actionLabels.askAssistant : COPY.actionLabels.openPlan);

/** Saf çizim: adımlar verilir, düğmeler istemci yaprağıdır. Dar ekranda dikey, `md`+ ekranda 5 sütun. */
export function WeeklyFlowView({ steps }: { steps: readonly WeeklyFlowStep[] }) {
  return (
    <section aria-labelledby="weekly-flow-heading" data-testid="weekly-flow" className="flex min-w-0 flex-col gap-3">
      <h2 id="weekly-flow-heading" className="text-sm font-semibold text-muted-foreground">
        {COPY.heading}
      </h2>
      <ol className="grid min-w-0 gap-2 md:grid-cols-5">
        {steps.map((step, index) => (
          <li
            key={step.key}
            data-step={step.key}
            data-state={step.state}
            aria-current={step.state === "active" ? "step" : undefined}
            className={cn("flex min-w-0 flex-col gap-2 rounded-xl border p-3", BOX[step.state])}
          >
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                  step.state === "done" ? "border-transparent bg-success-solid text-success-soft-foreground" : "border-current",
                )}
              >
                {step.state === "done" ? <Check className="size-3.5" /> : index + 1}
              </span>
              <span className="text-[0.9375rem] font-semibold">{COPY.stepNames[step.key]}</span>
              <span className="sr-only">{COPY.stateLabels[step.state]}</span>
            </div>
            <p className="text-sm leading-snug">{step.reason}</p>
            {step.state === "active" && (step.action || step.secondaryAction) ? (
              <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
                {step.action ? <WeeklyFlowActionButton action={step.action} label={labelOf(step.action)} primary unavailableNote={COPY.chatUnavailable} /> : null}
                {step.secondaryAction ? <WeeklyFlowActionButton action={step.secondaryAction} label={labelOf(step.secondaryAction)} unavailableNote={COPY.chatUnavailable} /> : null}
              </div>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
