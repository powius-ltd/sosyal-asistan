import { ApprovePlanButton } from "@/components/weekly-plan/approve-plan-button";
import { ConfidenceBadge } from "@/components/weekly-plan/confidence-badge";
import { Badge } from "@/components/ui/badge";
import { weekDayKeys, type WeeklyPlan, type WeeklyPlanStatus } from "@/lib/domain/weekly-plan";
import { DEFAULT_TIMEZONE, formatDate, formatDateTime, formatDayMonth } from "@/lib/format";
import { ALTERNATIVES_PLAIN, PLAN_SCREEN_PLAIN } from "@/lib/plain-language-plan";

const STATUS_LABEL: Record<WeeklyPlanStatus, string> = {
  draft: "Taslak",
  ready: "Hazır",
  archived: "Arşivlendi",
};

/** "5 Eki – 11 Eki 2026" (Pazartesi–Pazar). Gün okunamazsa undefined. */
export function weekRangeLabel(weekStart: string): string | undefined {
  const days = weekDayKeys(weekStart);
  if (days.length !== 7) return undefined;
  return `${formatDayMonth(days[0], "UTC")} – ${formatDate(days[6], "UTC")}`;
}

/** Planın üst şeridi: hafta aralığı, durum, genel güven, özet ve hazırlanma zamanı. */
export function PlanHeader({ plan }: { plan: WeeklyPlan }) {
  const range = weekRangeLabel(plan.weekStart) ?? plan.weekStart;
  return (
    <div className="flex flex-col gap-2 rounded-xl border p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-xl font-semibold tracking-tight">{range} haftası</h2>
        <Badge variant={plan.status === "ready" ? "default" : "secondary"}>{STATUS_LABEL[plan.status]}</Badge>
        {plan.confidence ? <ConfidenceBadge level={plan.confidence} /> : null}
        {plan.approvedAt ? <Badge variant="outline">{PLAN_SCREEN_PLAIN.approvedBadge(formatDate(plan.approvedAt, DEFAULT_TIMEZONE) ?? "—")}</Badge> : null}
      </div>
      <p className="text-sm text-muted-foreground">
        {PLAN_SCREEN_PLAIN.inPlan(plan.items.length)}
        {plan.alternatives.length > 0 ? `, ${ALTERNATIVES_PLAIN.count(plan.alternatives.length)}` : ""} · {PLAN_SCREEN_PLAIN.generated}:{" "}
        {formatDateTime(plan.generatedAt, DEFAULT_TIMEZONE) ?? "—"}
      </p>
      {plan.summary ? <p className="max-w-3xl text-sm">{plan.summary}</p> : null}
      {plan.status === "ready" && !plan.approvedAt ? (
        <div className="flex flex-col items-start gap-2 pt-1">
          <ApprovePlanButton weekStart={plan.weekStart} />
          <p className="text-xs text-muted-foreground">{PLAN_SCREEN_PLAIN.approveNote}</p>
        </div>
      ) : null}
    </div>
  );
}
