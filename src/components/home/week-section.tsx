import Link from "next/link";

import { DayStrip } from "@/components/home/day-strip";
import { JobCommand } from "@/components/workspace/job-command";
import { TODAY_COPY } from "@/lib/copy/today";
import type { WeeklyPlan } from "@/lib/domain/weekly-plan";
import { buildDayStrip } from "@/lib/home/day-strip";
import type { PlanItemStatus } from "@/lib/overview/plan-item-status";
import { thisWeekFor } from "@/lib/routes";

interface WeekSectionProps {
  /** En son plan; `null` hiç plan yok, `undefined` okunamadı. */
  plan: WeeklyPlan | null | undefined;
  /** Madde durumları (`planItemStatuses`, `plan.items` ile aynı sırada). */
  statuses?: readonly PlanItemStatus[];
  /** Günlerin ve saatlerin yazıldığı saat dilimi (çalışma alanınınki). */
  timeZone: string;
  /** Yönetici modu: plan yokken planı hazırlayan iş düğmesi görünür (işler kapalıysa komut yedeği). */
  operator?: boolean;
}

/**
 * "Bu hafta": 7 günlük şerit + "Planı aç". Plan yoksa ya da okunamadıysa uydurma gün çizilmez, tek cümle söylenir (yönetici modunda planı
 * hazırlayan düğmeyle). Planın haftası eski bir haftaysa şerit o haftayı gösterir; bayatlığı Demirkazık'ın cümlesi ve karar kartı söyler.
 */
export function WeekSection({ plan, statuses, timeZone, operator = false }: WeekSectionProps) {
  const strip = plan ? buildDayStrip(plan, statuses ?? [], timeZone) : undefined;
  return (
    <section aria-labelledby="today-week-heading" data-testid="today-week" className="flex min-w-0 flex-col gap-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="today-week-heading" className="font-figure text-[1.1875rem] leading-tight font-semibold tracking-tight">
          {TODAY_COPY.weekHeading}
        </h2>
        {plan ? (
          <Link href={thisWeekFor(plan.weekStart)} className="inline-flex min-h-11 items-center text-[0.9375rem] font-semibold whitespace-nowrap text-brand underline-offset-4 hover:underline">
            {TODAY_COPY.weekOpenPlan}
          </Link>
        ) : null}
      </div>
      {strip ? (
        <>
          <DayStrip strip={strip} />
          {strip.unplaced > 0 ? <p className="text-sm text-muted-foreground">{TODAY_COPY.weekUnplaced(strip.unplaced)}</p> : null}
        </>
      ) : (
        <div className="flex flex-col items-start gap-2 text-muted-foreground">
          <p>{plan === undefined ? TODAY_COPY.weekUnreadable : TODAY_COPY.weekNoPlan}</p>
          {operator && plan === null ? <JobCommand request={{ kind: "plan" }} className="items-start" /> : null}
        </div>
      )}
    </section>
  );
}
