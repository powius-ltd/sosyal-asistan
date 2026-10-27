import { CalendarCheck } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import { ALTERNATIVES_PLAIN } from "@/lib/plain-language-plan";
import { thisWeekFor } from "@/lib/routes";
import { cn } from "@/lib/utils";

/** Haftalık plana bağlantı (`/bu-hafta?hafta=2026-09-28`): adres kuralı `lib/routes.ts` `thisWeekFor`'dadır (kopya yok). */
export { PLAN_WEEK_PARAM, thisWeekFor as planHref } from "@/lib/routes";

/** "28 Eyl 2026 haftası" (hafta başı gün anahtarıdır: saat dilimi kayması olmasın diye UTC). */
export function planWeekLabel(weekStart: string): string {
  return `${formatDate(weekStart, "UTC") ?? weekStart} haftası`;
}

const BADGE_CLASS = "gap-1 border-transparent bg-plan-soft text-plan-soft-foreground";

/** Kaynağı haftalık plan olan fikrin rozeti; plan bağı varsa plana bağlantı (sıra ya da "yedekte" ile). */
export function PlanBadge({
  weeklyPlan,
  className,
}: {
  weeklyPlan?: { weekStart: string; position?: number };
  className?: string;
}) {
  const badge = (
    <Badge variant="outline" className={cn(BADGE_CLASS, className)} data-source="weekly_plan">
      <CalendarCheck aria-hidden />
      Haftalık plan
    </Badge>
  );
  if (!weeklyPlan) return badge;

  const place = weeklyPlan.position === undefined ? ALTERNATIVES_PLAIN.badge : `${weeklyPlan.position}. içerik`;
  const label = `${planWeekLabel(weeklyPlan.weekStart)} · ${place}`;
  return (
    <Link
      href={thisWeekFor(weeklyPlan.weekStart)}
      className="inline-flex items-center gap-1.5 max-md:min-h-tap"
      title="Haftalık plana aç"
      aria-label={`Haftalık planı aç: ${label}`}
    >
      {badge}
      <span className="text-xs text-muted-foreground underline-offset-2 hover:underline">{label}</span>
    </Link>
  );
}
