import { Badge } from "@/components/ui/badge";
import type { AdVerdictStatus } from "@/lib/domain/ads";
import { AD_VERDICT_PLAIN } from "@/lib/plain-language-ads";
import { cn } from "@/lib/utils";

const TONE: Record<AdVerdictStatus, string> = {
  scale: "bg-success-soft text-success-soft-foreground",
  hold: "bg-muted text-muted-foreground",
  reduce: "bg-warning-soft text-warning-soft-foreground",
  stop: "bg-danger-soft text-danger-soft-foreground",
  fatigued: "bg-warning-soft text-warning-soft-foreground",
  learning: "bg-muted text-muted-foreground",
  insufficient_data: "bg-muted text-muted-foreground",
  undecided: "bg-muted text-muted-foreground",
};

/** Kararın adı (anlam belirteçli renk; renk tek başına anlam taşımaz, ad her zaman yazılıdır). */
export function VerdictBadge({ status, className }: { status: AdVerdictStatus; className?: string }) {
  return (
    <Badge variant="secondary" className={cn("border-transparent", TONE[status], className)}>
      {AD_VERDICT_PLAIN[status].label}
    </Badge>
  );
}
