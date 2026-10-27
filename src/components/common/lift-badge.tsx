import { Clock, TriangleAlert } from "lucide-react";

import { Hint } from "@/components/common/hint";
import { MeasuredValue } from "@/components/common/measured-value";
import { Badge } from "@/components/ui/badge";
import { liftTierFor, type ContentScore, type LiftTier } from "@/lib/domain/content";
import { formatLift } from "@/lib/format";
import { IMMATURE_HINT, IMMATURE_LABEL, LIFT_UNMEASURED_PLAIN, LOW_CONFIDENCE_LABEL, SHORT_REASON_PLAIN, liftBadgeHint, liftBadgeLabel, lowConfidenceHint } from "@/lib/plain-language-results";
import { cn } from "@/lib/utils";

/** Kademe 0-4 renkleri: gri → mavi → yeşil → amber → gül. Açık/koyu temada okunur. */
const TIER_STYLES: Record<LiftTier, string> = {
  0: "border-transparent bg-muted text-muted-foreground",
  1: "border-transparent bg-tier-1-soft text-tier-1-soft-foreground",
  2: "border-transparent bg-tier-2-soft text-tier-2-soft-foreground",
  3: "border-transparent bg-tier-3-soft text-tier-3-soft-foreground",
  4: "border-transparent bg-tier-4-soft text-tier-4-soft-foreground",
};

type LiftBadgeProps = Partial<Pick<ContentScore, "lift" | "liftTier" | "lowConfidence" | "immature" | "baselineN" | "baselineViews">> & {
  className?: string;
};

/**
 * Lift rozeti: `<LiftBadge {...item.score} />`.
 * normaline göre sonuç ölçülemediyse (normali yok) "—" + sebep gösterir; kademe 0 ile karıştırılmaz.
 * Düşük güven (n<10) ve çok yeni (immature) içerikte ikon işareti eklenir.
 */
export function LiftBadge({ lift, liftTier, lowConfidence, immature, baselineN, baselineViews, className }: LiftBadgeProps) {
  if (lift === undefined) {
    return (
      <MeasuredValue
        value={undefined}
        reason={LIFT_UNMEASURED_PLAIN}
        shortReason={SHORT_REASON_PLAIN.noBaseline}
        className={className}
      />
    );
  }

  const tier = liftTier ?? liftTierFor(lift) ?? 0;

  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <Hint content={liftBadgeHint(tier, baselineViews)} label={liftBadgeLabel(lift)}>
        <Badge variant="outline" className={cn("font-mono tabular", TIER_STYLES[tier])} data-tier={tier}>
          {formatLift(lift)}
        </Badge>
      </Hint>
      {lowConfidence ? (
        <Hint
          content={lowConfidenceHint(baselineN)}
          label={LOW_CONFIDENCE_LABEL}
        >
          <TriangleAlert className="size-3.5 text-warning" aria-hidden />
        </Hint>
      ) : null}
      {immature ? (
        <Hint content={IMMATURE_HINT} label={IMMATURE_LABEL}>
          <Clock className="size-3.5 text-muted-foreground" aria-hidden />
        </Hint>
      ) : null}
    </span>
  );
}
