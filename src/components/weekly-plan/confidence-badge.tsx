import { TriangleAlert } from "lucide-react";

import { Hint } from "@/components/common/hint";
import { Badge } from "@/components/ui/badge";
import { BASELINE_LOW_CONFIDENCE_CAP_SHARE, confidenceForSample, type ConfidenceLevel } from "@/lib/domain/weekly-plan";
import { CONFIDENCE_CAPPED_PLAIN, confidenceBadgePlain, confidenceBasisPlain } from "@/lib/plain-language-plan";
import { cn } from "@/lib/utils";

const STYLES: Record<ConfidenceLevel, string> = {
  high: "border-transparent bg-success-soft text-success-soft-foreground",
  medium: "border-transparent bg-warning-soft text-warning-soft-foreground",
  low: "border-transparent bg-muted text-muted-foreground",
};

/**
 * Karşılaştırma tabanı (normal izlenme) bu rozette uygulanmış mı. Pay biliniyorsa (`LiftGroupStat.lowBaselineShare`) doğrudan eşikten; plan
 * yönlerinde pay yoktur (`FocusDirection`), tavan örnek sayısından çıkarılır: örnek sayısı "yüksek" diyor ama güven "orta" ise düşüren tavandır.
 */
export function isBaselineCapped(level: ConfidenceLevel, sampleSize?: number, lowBaselineShare?: number): boolean {
  if (lowBaselineShare !== undefined) return Number.isFinite(lowBaselineShare) && lowBaselineShare >= BASELINE_LOW_CONFIDENCE_CAP_SHARE;
  return level === "medium" && confidenceForSample(sampleSize) === "high";
}

interface ConfidenceBadgeProps {
  level: ConfidenceLevel;
  /** Güvenin dayandığı video sayısı (biliniyorsa balonda söylenir). */
  sampleSize?: number;
  /** Normaline göre ölçümü düşük güvenli videoların payı (0..1); yoksa tavan örnek sayısından çıkarılır. */
  lowBaselineShare?: number;
  className?: string;
}

/**
 * Güven rozeti. Metin her ekranla aynı sözlükten gelir (`CONFIDENCE_PLAIN`: "Eminim" / "Kısmen eminim" / "Az örnek, emin değilim").
 * Karşılaştırma tabanı az videoya dayanıyorsa uyarı ikonu ve açıklayıcı balon gösterir.
 */
export function ConfidenceBadge({ level, sampleSize, lowBaselineShare, className }: ConfidenceBadgeProps) {
  const capped = isBaselineCapped(level, sampleSize, lowBaselineShare);
  const text = confidenceBadgePlain(level);
  const lines = [confidenceBasisPlain(sampleSize), capped ? CONFIDENCE_CAPPED_PLAIN : undefined].filter((line): line is string => line !== undefined);

  const badge = (
    <Badge variant="outline" className={cn("gap-1", STYLES[level], lines.length === 0 && className)} data-confidence={level}>
      {capped ? <TriangleAlert aria-hidden /> : null}
      {text}
    </Badge>
  );
  if (lines.length === 0) return badge;
  return (
    <Hint content={<span className="block max-w-64 whitespace-normal">{lines.join(" ")}</span>} label={capped ? `${text}: ${CONFIDENCE_CAPPED_PLAIN}` : `${text}. ${lines.join(" ")}`} className={className}>
      {badge}
    </Hint>
  );
}
