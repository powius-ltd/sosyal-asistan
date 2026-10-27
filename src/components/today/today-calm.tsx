import { Demirkazik } from "@/components/mascot/demirkazik";
import { TODAY_COPY } from "@/lib/copy/today";

/**
 * Karar yokken ana blok: sakin, sarısız ("bugünlük bu kadar"); uydurma iş ve düğme yok. Cümle durumdan gelir (`TodayState.text`:
 * "senden bir şey beklemiyorum" ya da notların bayatlığı değil, o söz bloğundadır).
 */
export function TodayCalm({ text, maskotName, plain = false }: { text: string; maskotName: string; plain?: boolean }) {
  return (
    <section data-testid="today-clear" aria-labelledby="today-clear-heading" className="flex min-w-0 flex-col gap-1.5 rounded-card border border-awaiting-border p-5 lg:p-6">
      {plain ? null : (
        <div className="flex items-center gap-2 text-[0.9375rem] font-semibold text-brand">
          <Demirkazik state="waiting" className="size-6" />
          <span>{maskotName} bekliyor</span>
        </div>
      )}
      <h2 id="today-clear-heading" className="font-figure text-2xl/[1.12] font-bold tracking-tight">
        {TODAY_COPY.clearHeading}
      </h2>
      <p className="font-voice text-base leading-relaxed text-muted-foreground">{text}</p>
    </section>
  );
}
