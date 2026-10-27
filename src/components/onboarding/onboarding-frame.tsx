import { Check } from "lucide-react";
import type { ReactNode } from "react";

import { ONBOARDING_ROUTE_LENGTH } from "@/components/onboarding/flow-view";
import { Demirkazik } from "@/components/mascot/demirkazik";
import type { MascotState } from "@/lib/mascot/state";
import { ONBOARDING_ROUTE_PLAIN } from "@/lib/plain-language-onboarding";
import { cn } from "@/lib/utils";

interface OnboardingFrameProps {
  /** Ekranın başlığı ve Demirkazık'ın cümlesi (sözlükten). */
  title: string;
  lead: string;
  /** Uyarı / neden cümlesi (az video, benzer hesap bulunamadı…); yoksa yazılmaz. */
  notice?: string;
  maskotName: string;
  mascot: MascotState;
  /** Yol şeridindeki yer (1'den) ve akışın kapanıp kapanmadığı. */
  current: number;
  complete: boolean;
  children: ReactNode;
}

/**
 * Akış ekranlarının ortak çerçevesi: Demirkazık'ın sözü (sayfa başlığı; serif = onun cümlesi) + beş duraklı yol şeridi + ekranın kendisi.
 * Yol şeridi yalnız yer gösterir (bağlantı değildir: adım URL'de taşınmaz, veriden türer). Dar ekranda durak adlarından yalnız şimdiki
 * yazılır; hepsi ekran okuyucuya okunur.
 */
export function OnboardingFrame({ title, lead, notice, maskotName, mascot, current, complete, children }: OnboardingFrameProps) {
  return (
    <div className="mx-auto flex w-full max-w-5xl min-w-0 flex-col gap-6 lg:gap-8">
      <header className="flex min-w-0 items-start gap-3 lg:gap-4">
        <Demirkazik state={mascot} name={maskotName} className="mt-1 size-11 lg:size-14" />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <h1 className="font-voice text-[1.75rem]/[1.15] font-medium tracking-tight text-balance break-words lg:text-[2.25rem]/[1.12]">{title}</h1>
          {lead !== "" ? <p className="max-w-[62ch] font-voice text-[1.0625rem] leading-[1.5] text-muted-foreground">{lead}</p> : null}
          {notice !== undefined ? (
            <p className="mt-1 w-fit max-w-full rounded-inner bg-warning-soft px-3 py-2 text-sm font-medium text-warning-soft-foreground" data-slot="onboarding-notice">
              {notice}
            </p>
          ) : null}
        </div>
      </header>
      <RouteRail current={current} complete={complete} />
      {children}
    </div>
  );
}

function RouteRail({ current, complete }: { current: number; complete: boolean }) {
  const stops = ONBOARDING_ROUTE_PLAIN.stops;
  return (
    <nav aria-label={ONBOARDING_ROUTE_PLAIN.aria} data-slot="onboarding-route" data-current={current} data-complete={complete} className="flex min-w-0 flex-col gap-2">
      <ol className="flex min-w-0 items-center">
        {stops.map((label, index) => {
          const position = index + 1;
          const passed = complete || position < current;
          const here = !complete && position === current;
          return (
            <li key={label} aria-current={here ? "step" : undefined} className={cn("flex min-w-0 items-center gap-2", index < stops.length - 1 && "flex-1")}>
              <span
                className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-full border font-figure text-sm font-bold tabular-nums",
                  passed && "border-transparent bg-brand text-brand-foreground",
                  here && "border-transparent bg-focus-surface text-focus-ink ring-3 ring-attention",
                  !passed && !here && "border-dashed border-border text-muted-foreground",
                )}
              >
                {passed ? <Check className="size-4" aria-hidden /> : position}
              </span>
              <span className={cn("truncate text-sm", "sr-only lg:not-sr-only", here ? "font-semibold" : "text-muted-foreground", passed && "lg:text-foreground")}>{label}</span>
              {index < stops.length - 1 ? <span aria-hidden className={cn("mx-1 h-0.5 min-w-3 flex-1 rounded-pill", passed ? "bg-brand" : "bg-border")} /> : null}
            </li>
          );
        })}
      </ol>
      <p className="text-sm font-medium text-muted-foreground lg:hidden" aria-hidden>
        {ONBOARDING_ROUTE_PLAIN.position(Math.min(current, ONBOARDING_ROUTE_LENGTH), ONBOARDING_ROUTE_LENGTH)}
        {complete ? null : <span className="font-semibold text-foreground"> · {stops[Math.min(current, ONBOARDING_ROUTE_LENGTH) - 1]}</span>}
      </p>
    </nav>
  );
}
