import { Check } from "lucide-react";

import { WeeklyFlowActionButton } from "@/components/weekly-flow/weekly-flow-actions";
import { ENTRY_COPY as COPY } from "@/lib/copy/entry";
import type { EntryState, EntryStep } from "@/lib/entry/types";
import { cn } from "@/lib/utils";

/** Işık: biten yeşil, sıra sende sarı (yanıp söner), arka planda süren marka rengi (yanıp söner), bekleyen sönük. */
const LED: Record<EntryState, string> = {
  done: "border-transparent bg-success-solid text-success-soft-foreground",
  active: "border-attention-soft-edge bg-attention text-attention-ink ring-4 ring-attention-soft motion-safe:animate-pulse",
  running: "border-transparent bg-brand text-brand-foreground motion-safe:animate-pulse",
  waiting: "border-border bg-muted text-muted-foreground",
};

/** 7 adımlı hat (saf çizim): ışıklar bir çizgiyle bağlı; altında öndeki adımın tek cümlesi ve (varsa) eylemi. */
export function EntryLine({ steps }: { steps: readonly EntryStep[] }) {
  const focus = steps.find((s) => s.state === "active") ?? steps.find((s) => s.state === "running");
  return (
    <section aria-labelledby="entry-line-heading" data-testid="entry-line" className="flex min-w-0 flex-col gap-3 rounded-2xl border bg-card p-4 md:p-5">
      <h2 id="entry-line-heading" className="text-sm font-semibold text-muted-foreground">
        {COPY.lineHeading}
      </h2>
      <ol className="grid grid-cols-7 gap-0">
        {steps.map((s, i) => (
          <li key={s.key} data-step={s.key} data-state={s.state} aria-current={s.state === "active" ? "step" : undefined} className="relative flex min-w-0 flex-col items-center gap-1.5">
            {i > 0 ? (
              <span aria-hidden className={cn("absolute top-3 right-1/2 h-0.5 w-full -translate-y-1/2", steps[i - 1].state === "done" ? "bg-success-solid" : "bg-border")} />
            ) : null}
            <span aria-hidden className={cn("relative z-10 flex size-6 items-center justify-center rounded-full border text-[0.6875rem] font-semibold", LED[s.state])}>
              {s.state === "done" ? <Check className="size-3.5" /> : i + 1}
            </span>
            <span className={cn("w-full text-center text-[0.625rem] leading-tight tracking-tight sm:text-xs md:text-sm", s.state === "active" ? "font-semibold text-foreground" : "text-muted-foreground")}>
              <span className="sm:hidden">{COPY.stepShort[s.key] ?? COPY.stepNames[s.key]}</span>
              <span className="hidden sm:inline">{COPY.stepNames[s.key]}</span>
            </span>
            <span className="sr-only">
              {COPY.stateLabels[s.state]}: {s.reason}
            </span>
          </li>
        ))}
      </ol>
      {focus ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t pt-3" data-testid="entry-focus">
          <p className="text-[0.9375rem] leading-snug">
            <span className="font-semibold">
              {COPY.stepNames[focus.key]} · {COPY.stateLabels[focus.state]}.
            </span>{" "}
            {focus.reason}
          </p>
          {focus.action ? <WeeklyFlowActionButton action={focus.action} label="Asistan'a söyle" primary unavailableNote={COPY.card.chatUnavailable} /> : null}
        </div>
      ) : null}
    </section>
  );
}
