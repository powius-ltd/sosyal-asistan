import type { ReactNode } from "react";

import { ONBOARDING_ROUTE_LENGTH } from "@/components/onboarding/flow-view";
import { FOCUS_SURFACE } from "@/components/onboarding/surface";
import { Demirkazik } from "@/components/mascot/demirkazik";
import { ONBOARDING_ROUTE_PLAIN, ONBOARDING_TURN_PLAIN } from "@/lib/plain-language-onboarding";
import { cn } from "@/lib/utils";

/**
 * Kullanıcıdan karar beklenen blok: Bugün'deki karar bloğuyla aynı gece yüzeyi ve aynı işaret (Demirkazık "sıra sende", sarı nokta).
 * İçeriği (form, düğme) çağıran verir; sarı birincil düğme ekranda TEKTİR.
 */
export function DecisionBlock({ current, label, className, children }: { current: number; label: string; className?: string; children: ReactNode }) {
  return (
    <section aria-label={label} data-slot="onboarding-decision" className={cn(FOCUS_SURFACE, className)}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.9375rem] font-semibold">
        <Demirkazik state="turn" className="size-7 [--mascot-body:var(--focus-ink)] [--mascot-part:var(--focus-ink-muted)]" />
        <span className="text-attention">{ONBOARDING_TURN_PLAIN}</span>
        <span className="font-normal text-focus-ink-muted">· {ONBOARDING_ROUTE_PLAIN.position(current, ONBOARDING_ROUTE_LENGTH)}</span>
      </div>
      {children}
    </section>
  );
}

/** Ekranın iki sütunlu gövdesi: solda asıl blok, sağda sessiz yan sütun (dar ekranda alt alta). */
export function StepColumns({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:items-start lg:gap-8", className)}>{children}</div>;
}

/** Yan sütundaki "cümleli rakam" satırı (Bugün'deki karolarla aynı dil): büyük rakam + birimi + tek cümle. */
export function FigureRow({ figure, unit, text, detail, tone = "card" }: { figure: ReactNode; unit?: string; text: string; detail?: string; tone?: "card" | "brand" }) {
  return (
    <li className={cn("grid min-h-[5.5rem] min-w-0 grid-cols-[6.25rem_minmax(0,1fr)] items-center gap-3.5 rounded-card py-3.5 pr-4 pl-4", tone === "brand" ? "bg-brand-soft" : "bg-card")}>
      <div className={cn("font-figure text-[2.25rem] leading-[0.95] whitespace-nowrap font-bold tracking-[-0.04em] tabular-nums", tone === "brand" && "text-brand")}>
        {figure}
        {unit !== undefined ? <small className="mt-1 block font-sans text-sm leading-none font-semibold tracking-normal text-muted-foreground">{unit}</small> : null}
      </div>
      <p className="text-base leading-snug font-medium text-pretty">
        {text}
        {detail !== undefined ? <span className="mt-0.5 block text-sm font-normal text-muted-foreground">{detail}</span> : null}
      </p>
    </li>
  );
}
