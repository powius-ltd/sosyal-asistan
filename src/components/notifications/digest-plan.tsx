import Link from "next/link";

import { linkButtonClass } from "@/components/content/link-button";
import { planHref, planWeekLabel } from "@/components/ideas/plan-link";
import { DigestSection } from "@/components/notifications/digest-sections";
import { weekStartOf, type WeeklyPlanSummary } from "@/lib/domain/weekly-plan";
import { toDayKey } from "@/lib/format";
import { digestPlanLine } from "@/lib/plain-language-account";
import { truncateText } from "@/lib/text";

const SUMMARY_MAX = 220;

/**
 * Özetin ait olduğu haftanın (`now`'ın haftası, workspace saat diliminde) planı; yoksa undefined. Plan listesi
 * `listWeeklyPlans` özetleridir (fikirleri yüklemez); `now` çağıranın tek saatidir.
 */
export function pickCurrentPlan(
  plans: readonly WeeklyPlanSummary[],
  now: Date,
  timeZone: string,
): WeeklyPlanSummary | undefined {
  const dayKey = toDayKey(now, timeZone);
  const weekStart = dayKey ? weekStartOf(dayKey) : undefined;
  return weekStart ? plans.find((plan) => plan.weekStart === weekStart) : undefined;
}

/** Haftalık özette "Bu haftanın planı": kısa özet, içerik sayısı, güven ve plana bağlantı. Plan yoksa çizilmez. */
export function DigestPlan({ plan }: { plan?: WeeklyPlanSummary }) {
  if (!plan) return null;

  return (
    <DigestSection title="Bu haftanın planı" hint={planWeekLabel(plan.weekStart)}>
      {plan.summary ? <p className="text-sm">{truncateText(plan.summary, SUMMARY_MAX)}</p> : null}
      <p className="text-sm text-muted-foreground">
        {digestPlanLine(plan)}
      </p>
      <Link href={planHref(plan.weekStart)} className={`${linkButtonClass("outline")} w-fit`}>
        Planı aç
      </Link>
    </DigestSection>
  );
}
