import { Badge } from "@/components/ui/badge";
import { PLAN_ITEM_STATUS_LABEL, type PlanItemStatus, type PlanItemStatusKind } from "@/lib/overview/plan-item-status";
import { checkpointPhrase } from "@/lib/plain-language";
import { cn } from "@/lib/utils";

const STYLES: Record<PlanItemStatusKind, string> = {
  next: "border-transparent bg-primary text-primary-foreground",
  to_shoot: "border-transparent bg-muted text-muted-foreground",
  not_shot: "border-transparent bg-muted text-muted-foreground",
  skipped: "border-transparent bg-muted text-muted-foreground",
  published: "border-transparent bg-info-soft text-info-soft-foreground",
  awaiting_result: "border-transparent bg-warning-soft text-warning-soft-foreground",
  result: "border-transparent bg-muted text-foreground",
};

/** Plan maddesi durum rozeti; güçlü sonuçta (tutan video) yeşil, ölçüm bekleyende sıradaki gün adı (düz dil: "3. gün sonucu"). */
export function PlanItemStatusBadge({ status }: { status: PlanItemStatus }) {
  const style = status.kind === "result" && status.strongResult ? "border-transparent bg-success-soft text-success-soft-foreground" : STYLES[status.kind];
  const label = PLAN_ITEM_STATUS_LABEL[status.kind];
  return (
    <Badge variant="outline" className={cn("h-auto py-0.5 whitespace-normal", style)}>
      {label}
      {status.kind === "awaiting_result" && status.waitingDay !== undefined ? (
        <span className="font-normal"> · {checkpointPhrase(status.waitingDay)}</span>
      ) : null}
    </Badge>
  );
}
