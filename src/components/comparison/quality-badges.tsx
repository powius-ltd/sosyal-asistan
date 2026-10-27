import { Badge } from "@/components/ui/badge";
import type { DataQualityBadge } from "@/lib/domain/insights";
import { formatNumber } from "@/lib/format";
import { COMPARISON_PLAIN, DATA_QUALITY_PLAIN } from "@/lib/plain-language-results";

/** Veri kalitesi rozetleri ("Beğeni sayısı gizli 8/10"): hesabın sayısına neden fazla güvenilmemesi gerektiği. */
export function QualityBadges({ badges }: { badges: DataQualityBadge[] }) {
  if (badges.length === 0) return <span className="text-xs text-muted-foreground">{COMPARISON_PLAIN.qualityNone}</span>;
  return (
    <ul className="flex flex-col items-start gap-1">
      {badges.map((badge) => (
        <li key={badge.kind}>
          {/* Dar sütunda sütunu genişletmesin: rozet metni kendi içinde satır kırar (1440 px'te tablo taşmaz). */}
          <Badge variant="outline" className="h-auto rounded-md py-0.5 text-left leading-tight whitespace-normal tabular">
            {DATA_QUALITY_PLAIN[badge.kind]} {formatNumber(badge.count)}/{formatNumber(badge.total)}
          </Badge>
        </li>
      ))}
    </ul>
  );
}
