import Link from "next/link";

import { planHref } from "@/components/weekly-plan/week-param";
import { weekRangeLabel } from "@/components/weekly-plan/plan-header";
import type { WeeklyPlanSummary } from "@/lib/domain/weekly-plan";
import { formatDayMonth } from "@/lib/format";
import { TAP } from "@/components/weekly-plan/tap-target";
import { cn } from "@/lib/utils";

/** Hafta seçici: geçmiş planlar (yeniden eskiye) bağlantı olarak; seçili hafta işaretli. Sunucu bileşeni, JS gerekmez. */
export function WeekPicker({ plans, selected }: { plans: WeeklyPlanSummary[]; selected?: string }) {
  if (plans.length === 0) return null;
  return (
    <nav aria-label="Hafta seç" className="mb-6 flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-muted-foreground">Hafta</span>
      {plans.map((plan) => {
        const current = plan.weekStart === selected;
        return (
          <Link
            key={plan.id}
            href={planHref(plan.weekStart)}
            aria-current={current ? "page" : undefined}
            title={weekRangeLabel(plan.weekStart)}
            className={cn(
              "inline-flex items-center rounded-full border px-3 py-1 text-xs tabular transition-colors",
              TAP,
              current ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
            )}
          >
            {formatDayMonth(plan.weekStart, "UTC") ?? plan.weekStart}
          </Link>
        );
      })}
    </nav>
  );
}
